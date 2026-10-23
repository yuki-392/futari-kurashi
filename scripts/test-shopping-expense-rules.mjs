import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  limit,
  serverTimestamp,
  Timestamp,
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
const a = db('pa'),
  b = db('pb'),
  others = [
    db('po'),
    db('pn'),
    db('pa', false),
    env.unauthenticatedContext().firestore(),
  ]
const ref = (d, c, id) => doc(d, 'households', 'purchase-home', c, id)
const audit = (uid) => ({
  createdAt: serverTimestamp(),
  createdBy: uid,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  version: 1,
})
const item = (patch = {}) => ({
  title: '牛乳',
  category: 'food',
  quantity: '2',
  unit: '本',
  budget: 500,
  assigneeIds: ['pa'],
  priority: 2,
  purchased: false,
  ...audit('pa'),
  ...patch,
})
const expense = (sid, patch = {}) => ({
  type: 'expense',
  title: '実額',
  amount: 101,
  date: '2026-10-23',
  categoryId: 'expense_food',
  memo: '',
  sharing: null,
  shoppingItemId: sid,
  ...audit('pa'),
  ...patch,
})
const link = (eid, patch = {}) => ({
  expenseId: eid,
  createdAt: serverTimestamp(),
  createdBy: 'pa',
  ...patch,
})
const update = (patch = {}) => ({
  purchased: true,
  expenseId: 'e',
  version: 2,
  updatedAt: serverTimestamp(),
  updatedBy: 'pa',
  ...patch,
})
let allowed = 0,
  denied = 0
const yes = async (x) => {
  await assertSucceeds(x)
  allowed++
}
async function dump() {
  return env.withSecurityRulesDisabled(async (c) => {
    const out = {}
    for (const col of [
      'shoppingItems',
      'expenses',
      'shoppingExpenseLinks',
      'settlementMonths',
    ]) {
      const snap = await getDocs(
        collection(c.firestore(), 'households', 'purchase-home', col),
      )
      out[col] = snap.docs
        .map((d) => [d.id, d.data()])
        .sort((x, y) => x[0].localeCompare(y[0]))
    }
    return JSON.stringify(out)
  })
}
async function no(action) {
  const before = await dump()
  const error = await assertFails(action())
  assert.equal(error.code, 'permission-denied')
  assert.equal(await dump(), before)
  denied++
}
function register(d, sid, eid = 'e', options = {}) {
  const batch = writeBatch(d)
  if (!options.omitItem)
    batch.update(
      ref(d, 'shoppingItems', sid),
      update({ expenseId: eid, ...options.item }),
    )
  if (!options.omitExpense)
    batch.set(ref(d, 'expenses', eid), expense(sid, options.expense))
  if (!options.omitLink)
    batch.set(ref(d, 'shoppingExpenseLinks', sid), link(eid, options.link))
  if (options.month)
    batch.set(ref(d, 'settlementMonths', '2026-10'), {
      month: '2026-10',
      netPaid: 0,
      version: 1,
      lastKind: 'expense',
      lastId: eid,
      ...audit('pa'),
    })
  return batch.commit()
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    for (const uid of ['pa', 'pb'])
      await setDoc(doc(d, 'users', uid), { householdId: 'purchase-home' })
    await setDoc(doc(d, 'households', 'purchase-home'), {
      ownerId: 'pa',
      memberIds: ['pa', 'pb'],
    })
    await setDoc(doc(d, 'users', 'po'), { householdId: 'purchase-other' })
    await setDoc(doc(d, 'households', 'purchase-other'), {
      ownerId: 'po',
      memberIds: ['po'],
    })
    await setDoc(ref(d, 'financeCategories', 'expense_food'), {
      type: 'expense',
      name: '食費',
      archived: false,
      standard: true,
      ...audit('pa'),
    })
    await setDoc(ref(d, 'financeCategories', 'archived'), {
      type: 'expense',
      name: '過去',
      archived: true,
      standard: false,
      ...audit('pa'),
    })
  })
  await yes(setDoc(ref(a, 'shoppingItems', 's'), item()))
  // Before implementation this successful atomic operation is rejected: RED.
  await yes(register(a, 's'))
  for (const d of others) {
    for (const c of ['shoppingItems', 'expenses', 'shoppingExpenseLinks']) {
      await no(() => getDoc(ref(d, c, c === 'expenses' ? 'e' : 's')))
      await no(() =>
        setDoc(
          ref(d, c, 'bad'),
          c === 'shoppingItems'
            ? item()
            : c === 'expenses'
              ? expense('s')
              : link('e'),
        ),
      )
    }
  }
  await yes(getDoc(ref(b, 'shoppingExpenseLinks', 's')))
  await no(() =>
    getDocs(
      query(
        collection(a, 'households', 'purchase-home', 'shoppingExpenseLinks'),
        limit(100),
      ),
    ),
  )
  for (const patch of [
    { expenseId: 'fake' },
    { createdBy: 'pb' },
    { createdAt: serverTimestamp() },
    { extra: true },
  ])
    await no(() => updateDoc(ref(a, 'shoppingExpenseLinks', 's'), patch))
  await no(() => deleteDoc(ref(a, 'shoppingExpenseLinks', 's')))
  await no(() =>
    updateDoc(
      ref(a, 'shoppingItems', 's'),
      update({ version: 3, expenseId: 'changed' }),
    ),
  )
  const saved = (await getDoc(ref(a, 'shoppingItems', 's'))).data()
  delete saved.expenseId
  await no(() =>
    setDoc(ref(a, 'shoppingItems', 's'), {
      ...saved,
      version: 3,
      updatedAt: serverTimestamp(),
    }),
  )
  await yes(
    updateDoc(
      ref(b, 'shoppingItems', 's'),
      update({
        version: 3,
        purchased: false,
        updatedBy: 'pb',
        title: '別の商品名',
      }),
    ),
  )
  await no(() => register(a, 's', 'duplicate', { item: { version: 4 } }))
  await yes(
    updateDoc(ref(a, 'expenses', 'e'), {
      title: '独立編集',
      amount: 202,
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'pa',
    }),
  )
  await no(() =>
    updateDoc(ref(a, 'expenses', 'e'), {
      shoppingItemId: 'different',
      version: 3,
      updatedAt: serverTimestamp(),
      updatedBy: 'pa',
    }),
  )
  const original = (await getDoc(ref(a, 'expenses', 'e'))).data()
  delete original.shoppingItemId
  await no(() =>
    setDoc(ref(a, 'expenses', 'e'), {
      ...original,
      version: 3,
      updatedAt: serverTimestamp(),
    }),
  )
  await yes(deleteDoc(ref(a, 'expenses', 'e')))
  await no(() => register(a, 's', 'again', { item: { version: 4 } }))
  await yes(deleteDoc(ref(a, 'shoppingItems', 's')))
  await no(() => setDoc(ref(a, 'shoppingItems', 's'), item()))
  await no(() => setDoc(ref(a, 'expenses', 'e'), expense('s')))
  // Every malformed group must leave item, expense, marker and month unchanged.
  const cases = [
    { omitItem: true },
    { omitExpense: true },
    { omitLink: true },
    { item: { purchased: false } },
    { item: { version: 9 } },
    { item: { title: 'silent edit' } },
    { item: { expenseId: 'wrong' } },
    { expense: { shoppingItemId: 'foreign' } },
    { expense: { type: 'income' } },
    { expense: { amount: 0 } },
    { expense: { categoryId: 'archived' } },
    { expense: { categoryId: 'unknown' } },
    { expense: { shoppingItemId: 1 } },
    { expense: { extra: true } },
    { expense: { createdBy: 'pb' } },
    { expense: { createdAt: Timestamp.fromMillis(0) } },
    { link: { expenseId: 'wrong' } },
    { link: { expenseId: 5 } },
    { link: { extra: true } },
    { link: { createdBy: 'pb' } },
    { link: { createdAt: Timestamp.fromMillis(0) } },
    { expense: { sharing: { payerId: 'pa', shares: { pa: 50, pb: 50 } } } },
  ]
  for (let i = 0; i < cases.length; i++) {
    const sid = `bad-${i}`
    await yes(setDoc(ref(a, 'shoppingItems', sid), item()))
    await no(() => register(a, sid, `bad-e-${i}`, cases[i]))
  }
  await yes(
    setDoc(ref(a, 'shoppingItems', 'later'), item({ purchased: false })),
  )
  await yes(
    updateDoc(ref(a, 'shoppingItems', 'later'), {
      purchased: true,
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'pa',
    }),
  )
  await yes(register(a, 'later', 'later-expense', { item: { version: 3 } }))
  await yes(setDoc(ref(a, 'shoppingItems', 'shared'), item()))
  await yes(
    register(a, 'shared', 'shared-expense', {
      expense: { sharing: { payerId: 'pa', shares: { pa: 50, pb: 50 } } },
      month: true,
    }),
  )
  const shared = (await getDoc(ref(a, 'settlementMonths', '2026-10'))).data()
  assert.equal(shared.version, 1)
  assert.equal(shared.lastId, 'shared-expense')
  for (const kind of ['register', 'edit', 'delete']) {
    const sid = `race-${kind}`
    await yes(setDoc(ref(a, 'shoppingItems', sid), item()))
    const other =
      kind === 'register'
        ? () =>
            register(b, sid, `race-b-${kind}`, {
              expense: { createdBy: 'pb', updatedBy: 'pb' },
              item: { updatedBy: 'pb' },
              link: { createdBy: 'pb' },
            })
        : kind === 'edit'
          ? () =>
              updateDoc(ref(b, 'shoppingItems', sid), {
                title: '相手編集',
                version: 2,
                updatedAt: serverTimestamp(),
                updatedBy: 'pb',
              })
          : () => deleteDoc(ref(b, 'shoppingItems', sid))
    const result = await Promise.allSettled([
      register(a, sid, `race-a-${kind}`),
      other(),
    ])
    if (kind !== 'delete') {
      assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(
        result.find((r) => r.status === 'rejected').reason.code,
        'permission-denied',
      )
    } else {
      assert.ok(result.some((r) => r.status === 'fulfilled'))
      for (const r of result)
        if (r.status === 'rejected')
          assert.equal(r.reason.code, 'permission-denied')
    }
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore(),
        mark = await getDoc(ref(d, 'shoppingExpenseLinks', sid)),
        first = await getDoc(ref(d, 'expenses', `race-a-${kind}`)),
        second = await getDoc(ref(d, 'expenses', `race-b-${kind}`))
      assert.equal(
        Number(first.exists()) + Number(second.exists()),
        mark.exists() ? 1 : 0,
      )
      if (mark.exists()) {
        const saved = await getDoc(ref(d, 'expenses', mark.data().expenseId))
        assert.equal(saved.data().shoppingItemId, sid)
      }
    })
  }
  console.log(
    `Shopping-expense rules passed: ${allowed} allowed / ${denied} denied; atomicity, immutable links, isolation, deletion persistence, independent edits, settlement and races`,
  )
} finally {
  await env.cleanup()
}
