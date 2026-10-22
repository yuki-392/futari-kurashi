import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  serverTimestamp,
  setLogLevel,
} from 'firebase/firestore'
setLogLevel('silent')
const env = await initializeTestEnvironment({
  projectId: 'demo-futari-kurashi',
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: await readFile('firestore.rules', 'utf8'),
  },
})
const db = (uid, verified = true) =>
  env
    .authenticatedContext(uid, {
      email: `${uid}@example.test`,
      email_verified: verified,
    })
    .firestore()
const a = db('budget-a'),
  b = db('budget-b'),
  others = [
    db('budget-other'),
    db('budget-none'),
    db('budget-a', false),
    env.unauthenticatedContext().firestore(),
  ]
const path = (id) => `households/budget-home/budgets/${id}`,
  target = (database, id) => doc(database, path(id))
const data = (patch = {}) => ({
  month: '2026-10',
  scope: 'total',
  categoryId: null,
  amount: 0,
  version: 1,
  createdAt: serverTimestamp(),
  createdBy: 'budget-a',
  updatedAt: serverTimestamp(),
  updatedBy: 'budget-a',
  ...patch,
})
let allowed = 0,
  denied = 0
async function yes(p) {
  await assertSucceeds(p)
  allowed++
}
async function no(p) {
  const e = await assertFails(p)
  assert.equal(e.code, 'permission-denied')
  denied++
}
async function readRaw(id) {
  let result
  await env.withSecurityRulesDisabled(async (c) => {
    result = (await getDoc(target(c.firestore(), id))).data()
  })
  return result
}
async function unchanged(id, operation) {
  const before = await readRaw(id)
  await no(operation())
  assert.deepEqual(await readRaw(id), before)
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    await setDoc(doc(d, 'households/budget-home'), {
      memberIds: ['budget-a', 'budget-b'],
    })
    await setDoc(doc(d, 'households/budget-other'), {
      memberIds: ['budget-other'],
    })
    for (const uid of ['budget-a', 'budget-b'])
      await setDoc(doc(d, 'users', uid), { householdId: 'budget-home' })
    await setDoc(doc(d, 'users/budget-other'), { householdId: 'budget-other' })
    for (const [id, type, archived] of [
      ['food', 'expense', false],
      ['old', 'expense', true],
      ['salary', 'income', false],
    ])
      await setDoc(doc(d, 'households/budget-home/financeCategories', id), {
        type,
        archived,
      })
    await setDoc(doc(d, 'households/budget-other/financeCategories/foreign'), {
      type: 'expense',
      archived: false,
    })
  })
  await yes(setDoc(target(a, '2026-10__total'), data()))
  await yes(
    setDoc(
      target(a, '2026-10__category__food'),
      data({ scope: 'category', categoryId: 'food', amount: 999999999 }),
    ),
  )
  await yes(getDoc(target(b, '2026-10__total')))
  await yes(
    getDocs(
      query(
        collection(a, 'households/budget-home/budgets'),
        where('month', '==', '2026-10'),
        limit(102),
      ),
    ),
  )
  for (const d of others) {
    await no(getDoc(target(d, '2026-10__total')))
    await no(
      getDocs(query(collection(d, 'households/budget-home/budgets'), limit(5))),
    )
    await no(setDoc(target(d, '2026-11__total'), data({ month: '2026-11' })))
    await no(
      updateDoc(target(d, '2026-10__total'), {
        amount: 10,
        version: 2,
        updatedBy: 'budget-a',
        updatedAt: serverTimestamp(),
      }),
    )
    await no(deleteDoc(target(d, '2026-10__total')))
  }
  await no(getDocs(collection(a, 'households/budget-home/budgets')))
  await no(
    getDocs(query(collection(a, 'households/budget-home/budgets'), limit(103))),
  )
  await no(getDoc(doc(a, 'households/budget-other/budgets/2026-10__total')))
  for (const amount of [-1, 1.5, 1000000000, '0', null])
    await no(
      setDoc(target(a, '2026-11__total'), data({ month: '2026-11', amount })),
    )
  for (const month of ['2026-13', '2026-00', '2026-1', '0999-01', '2026-01-01'])
    await no(setDoc(target(a, `${month}__total`), data({ month })))
  for (const categoryId of ['missing', 'foreign', 'old', 'salary'])
    await no(
      setDoc(
        target(a, `2026-10__category__${categoryId}`),
        data({ scope: 'category', categoryId }),
      ),
    )
  for (const patch of [
    { scope: 'other' },
    { categoryId: 'food' },
    { createdBy: 'budget-b' },
    { updatedBy: 'budget-b' },
    { createdAt: new Date(0) },
    { updatedAt: new Date(0) },
    { version: 2 },
    { extra: true },
    { month: '2026-12' },
  ])
    await no(
      setDoc(target(a, '2026-11__total'), data({ month: '2026-11', ...patch })),
    )
  for (const key of Object.keys(data())) {
    const value = data({ month: '2026-11' })
    delete value[key]
    await no(setDoc(target(a, '2026-11__total'), value))
  }
  for (const patch of [
    { amount: -1 },
    { version: 1 },
    { createdBy: 'budget-b' },
    { createdAt: new Date(0) },
    { categoryId: 'food' },
    { scope: 'category' },
    { month: '2026-11' },
    { extra: 1 },
    { updatedBy: 'budget-b' },
  ])
    await unchanged('2026-10__total', () =>
      updateDoc(target(a, '2026-10__total'), {
        amount: 1,
        version: 2,
        updatedAt: serverTimestamp(),
        updatedBy: 'budget-a',
        ...patch,
      }),
    )
  await yes(
    updateDoc(target(b, '2026-10__total'), {
      amount: 100,
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'budget-b',
    }),
  )
  const before = await readRaw('2026-10__total')
  const races = await Promise.allSettled(
    [a, b].map((d, i) =>
      updateDoc(target(d, '2026-10__total'), {
        amount: 200 + i,
        version: 3,
        updatedAt: serverTimestamp(),
        updatedBy: i ? 'budget-b' : 'budget-a',
      }),
    ),
  )
  assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    races.find((r) => r.status === 'rejected').reason.code,
    'permission-denied',
  )
  const after = await readRaw('2026-10__total')
  assert.equal(after.version, 3)
  assert.ok([200, 201].includes(after.amount))
  assert.deepEqual(after.createdAt, before.createdAt)
  await env.withSecurityRulesDisabled(async (c) =>
    updateDoc(
      doc(c.firestore(), 'households/budget-home/financeCategories/food'),
      { archived: true },
    ),
  )
  await unchanged('2026-10__category__food', () =>
    updateDoc(target(a, '2026-10__category__food'), {
      amount: 1,
      version: 2,
      updatedBy: 'budget-a',
      updatedAt: serverTimestamp(),
    }),
  )
  await yes(getDoc(target(a, '2026-10__category__food')))
  await yes(deleteDoc(target(b, '2026-10__category__food')))
  assert.equal(await readRaw('2026-10__category__food'), undefined)
  console.log(
    `Budget rules passed: ${allowed} allowed / ${denied} denied; schema, isolation, audit, immutable rejection, archives and competing writes`,
  )
} finally {
  await env.cleanup()
}
