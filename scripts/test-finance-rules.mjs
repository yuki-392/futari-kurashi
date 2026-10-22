import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { setLogLevel } from 'firebase/firestore'

setLogLevel('silent')
const env = await initializeTestEnvironment({
  projectId: 'demo-futari-kurashi',
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: await readFile('firestore.rules', 'utf8'),
  },
})
const ctx = (uid, verified = true) =>
  env
    .authenticatedContext(uid, {
      email: `${uid}@example.test`,
      email_verified: verified,
    })
    .firestore()
const a = ctx('fin-a'),
  b = ctx('fin-b'),
  outsider = ctx('fin-other'),
  none = ctx('fin-none'),
  unverified = ctx('fin-a', false),
  guest = env.unauthenticatedContext().firestore()
const categoryPath = (id) => `households/fin-home/financeCategories/${id}`
const entryPath = (type, id) =>
  `households/fin-home/${type === 'income' ? 'incomes' : 'expenses'}/${id}`
const category = (patch = {}) => ({
  type: 'expense',
  name: '食費',
  archived: false,
  standard: true,
  version: 1,
  createdAt: serverTimestamp(),
  createdBy: 'fin-a',
  updatedAt: serverTimestamp(),
  updatedBy: 'fin-a',
  ...patch,
})
const entry = (patch = {}) => ({
  type: 'expense',
  title: '食材',
  amount: 1200,
  date: '2026-10-21',
  categoryId: 'expense_food',
  memo: '',
  version: 1,
  createdAt: serverTimestamp(),
  createdBy: 'fin-a',
  updatedAt: serverTimestamp(),
  updatedBy: 'fin-a',
  ...patch,
})
let allows = 0,
  denies = 0
async function yes(operation) {
  try {
    await assertSucceeds(operation)
    allows++
  } catch (error) {
    throw new Error(`Expected allow ${allows + 1}`, { cause: error })
  }
}
async function no(operation) {
  const error = await assertFails(operation)
  assert.equal(error.code, 'permission-denied')
  denies++
}
async function unchanged(path, operation) {
  let before, after
  await env.withSecurityRulesDisabled(async (c) => {
    before = (await getDoc(doc(c.firestore(), path))).data()
  })
  await no(operation())
  await env.withSecurityRulesDisabled(async (c) => {
    after = (await getDoc(doc(c.firestore(), path))).data()
  })
  assert.deepEqual(after, before)
}

try {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    await setDoc(doc(db, 'households/fin-home'), {
      memberIds: ['fin-a', 'fin-b'],
      ownerId: 'fin-a',
    })
    for (const uid of ['fin-a', 'fin-b'])
      await setDoc(doc(db, 'users', uid), { householdId: 'fin-home' })
    await setDoc(doc(db, 'households/fin-other'), {
      memberIds: ['fin-other'],
      ownerId: 'fin-other',
    })
    await setDoc(doc(db, 'users/fin-other'), { householdId: 'fin-other' })
    await setDoc(doc(db, categoryPath('expense_food')), {
      ...category(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  await yes(
    setDoc(
      doc(a, categoryPath('income_salary')),
      category({ type: 'income', name: '給与', version: 1 }),
    ),
  )
  await yes(getDoc(doc(b, categoryPath('income_salary'))))
  await yes(
    setDoc(
      doc(a, categoryPath('custom-expense-1')),
      category({ name: 'ペット', standard: false }),
    ),
  )
  await yes(setDoc(doc(a, entryPath('expense', 'valid-expense')), entry()))
  await yes(
    setDoc(
      doc(b, entryPath('income', 'valid-income')),
      entry({
        type: 'income',
        categoryId: 'income_salary',
        title: '給与',
        amount: 250000,
        createdBy: 'fin-b',
        updatedBy: 'fin-b',
      }),
    ),
  )
  await yes(getDoc(doc(b, entryPath('expense', 'valid-expense'))))
  for (const type of ['incomes', 'expenses']) {
    await yes(
      getDocs(
        query(
          collection(b, `households/fin-home/${type}`),
          where('date', '>=', '2026-10-01'),
          where('date', '<=', '2026-10-31'),
          orderBy('date', 'desc'),
          orderBy('createdAt', 'desc'),
          limit(10000),
        ),
      ),
    )
  }

  for (const db of [outsider, none, unverified, guest]) {
    await no(getDoc(doc(db, entryPath('expense', 'valid-expense'))))
    await no(
      getDocs(query(collection(db, 'households/fin-home/expenses'), limit(5))),
    )
    await no(setDoc(doc(db, entryPath('expense', 'intrude')), entry()))
    await no(deleteDoc(doc(db, entryPath('expense', 'valid-expense'))))
  }
  await no(getDocs(collection(a, 'households/fin-home/expenses')))
  await no(getDocs(collection(a, 'households/fin-home/financeCategories')))
  await no(
    getDocs(
      query(collection(a, 'households/fin-home/financeCategories'), limit(101)),
    ),
  )
  await no(getDocs(collection(a, 'households/fin-other/expenses')))
  await unchanged(entryPath('expense', 'valid-expense'), () =>
    updateDoc(doc(a, entryPath('expense', 'valid-expense')), {
      amount: -1,
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'fin-a',
    }),
  )
  await unchanged(entryPath('expense', 'valid-expense'), () =>
    updateDoc(doc(a, entryPath('expense', 'valid-expense')), {
      amount: 1201,
      version: 1,
      updatedAt: serverTimestamp(),
      updatedBy: 'fin-a',
    }),
  )
  await no(
    setDoc(
      doc(a, entryPath('expense', 'wrong-category')),
      entry({ categoryId: 'income_salary' }),
    ),
  )
  await no(
    setDoc(
      doc(a, entryPath('expense', 'extra-field')),
      entry({ secret: true }),
    ),
  )
  await no(
    setDoc(
      doc(a, categoryPath('bad-category')),
      category({ name: '   ', standard: false }),
    ),
  )
  await unchanged(categoryPath('custom-expense-1'), () =>
    updateDoc(doc(a, categoryPath('custom-expense-1')), {
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'fin-other',
    }),
  )
  await yes(
    updateDoc(doc(a, categoryPath('custom-expense-1')), {
      name: 'ペット用品',
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'fin-a',
    }),
  )
  await yes(
    updateDoc(doc(b, categoryPath('custom-expense-1')), {
      archived: true,
      version: 3,
      updatedAt: serverTimestamp(),
      updatedBy: 'fin-b',
    }),
  )
  await no(
    setDoc(
      doc(a, entryPath('expense', 'archived-new')),
      entry({ categoryId: 'custom-expense-1' }),
    ),
  )
  await yes(
    updateDoc(doc(b, entryPath('expense', 'valid-expense')), {
      title: '修正',
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'fin-b',
    }),
  )
  await no(
    updateDoc(doc(b, entryPath('expense', 'valid-expense')), {
      createdBy: 'fin-b',
      version: 3,
      updatedAt: serverTimestamp(),
      updatedBy: 'fin-b',
    }),
  )
  await no(deleteDoc(doc(a, categoryPath('expense_food'))))
  console.log(`Finance rules tests passed: ${allows} allowed, ${denies} denied`)
} finally {
  await env.cleanup()
}
