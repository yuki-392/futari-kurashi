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
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  limit,
  query,
  setLogLevel,
  runTransaction,
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
const a = db('sa'),
  b = db('sb'),
  outsiders = [
    db('sx'),
    db('sn'),
    db('sa', false),
    env.unauthenticatedContext().firestore(),
  ]
const ref = (d, c, id) => doc(d, 'households', 'settle', c, id)
const audit = (uid) => ({
  version: 1,
  createdAt: serverTimestamp(),
  createdBy: uid,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
})
const expense = (patch = {}) => ({
  type: 'expense',
  title: '割り勘',
  amount: 101,
  date: '2026-10-01',
  categoryId: 'food',
  memo: '',
  ...audit('sa'),
  sharing: { payerId: 'sa', shares: { sa: 50, sb: 50 } },
  ...patch,
})
const ledger = (patch = {}) => ({
  month: '2026-10',
  netPaid: 0,
  lastKind: 'expense',
  lastId: 'e',
  ...audit('sa'),
  ...patch,
})
const pay = (patch = {}) => ({
  month: '2026-10',
  fromUid: 'sb',
  toUid: 'sa',
  amount: 50,
  date: '2026-11-01',
  canceledAt: null,
  canceledBy: null,
  ...audit('sa'),
  ...patch,
})
let allowed = 0,
  denied = 0
async function yes(op) {
  await assertSucceeds(op)
  allowed++
}
async function raw() {
  let result
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    result = await Promise.all(
      ['expenses', 'settlementMonths', 'settlementPayments'].map(async (name) =>
        (await getDocs(collection(d, 'households/settle', name))).docs.map(
          (s) => [s.id, s.data()],
        ),
      ),
    )
  })
  return result
}
async function no(fn) {
  const before = await raw()
  const error = await assertFails(fn())
  assert.equal(error.code, 'permission-denied')
  assert.deepEqual(await raw(), before)
  denied++
}
function create(d, id = 'e', patch = {}, monthPatch = {}) {
  const batch = writeBatch(d)
  batch.set(ref(d, 'expenses', id), expense(patch))
  batch.set(
    ref(d, 'settlementMonths', '2026-10'),
    ledger({ lastId: id, ...monthPatch }),
  )
  return batch.commit()
}
function payment(d, id = 'p', version = 2, patch = {}, monthPatch = {}) {
  const batch = writeBatch(d)
  batch.set(ref(d, 'settlementPayments', id), pay(patch))
  batch.update(ref(d, 'settlementMonths', '2026-10'), {
    netPaid: 50,
    version,
    lastKind: 'payment',
    lastId: id,
    updatedAt: serverTimestamp(),
    updatedBy: 'sa',
    ...monthPatch,
  })
  return batch.commit()
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    await setDoc(doc(d, 'households/settle'), {
      ownerId: 'sa',
      memberIds: ['sa', 'sb'],
    })
    await setDoc(doc(d, 'households/foreign'), {
      ownerId: 'sx',
      memberIds: ['sx'],
    })
    for (const uid of ['sa', 'sb'])
      await setDoc(doc(d, 'users', uid), { householdId: 'settle' })
    await setDoc(doc(d, 'users/sx'), { householdId: 'foreign' })
    await setDoc(ref(d, 'financeCategories', 'food'), {
      type: 'expense',
      archived: false,
    })
  })
  await yes(create(a))
  await yes(getDoc(ref(b, 'expenses', 'e')))
  await yes(
    getDocs(
      query(collection(b, 'households/settle/settlementMonths'), limit(10000)),
    ),
  )
  for (const d of outsiders)
    for (const c of ['expenses', 'settlementMonths', 'settlementPayments']) {
      await no(() => getDoc(ref(d, c, c === 'expenses' ? 'e' : '2026-10')))
      await no(() =>
        getDocs(query(collection(d, 'households/settle', c), limit(10))),
      )
      await no(() =>
        setDoc(
          ref(d, c, 'bad'),
          c === 'expenses'
            ? expense()
            : c === 'settlementMonths'
              ? ledger()
              : pay(),
        ),
      )
      await no(() => deleteDoc(ref(d, c, c === 'expenses' ? 'e' : '2026-10')))
    }
  for (const c of ['settlementMonths', 'settlementPayments']) {
    await no(() => getDocs(collection(a, 'households/settle', c)))
    await no(() =>
      getDocs(query(collection(a, 'households/settle', c), limit(10001))),
    )
  }
  await no(() => setDoc(ref(a, 'expenses', 'solo'), expense()))
  await no(() => setDoc(ref(a, 'settlementPayments', 'solo'), pay()))
  await no(() => deleteDoc(ref(a, 'expenses', 'e')))
  await no(() =>
    updateDoc(ref(a, 'expenses', 'e'), {
      amount: 100,
      version: 2,
      updatedAt: serverTimestamp(),
    }),
  )
  await no(() =>
    updateDoc(ref(a, 'settlementMonths', '2026-10'), {
      version: 2,
      lastKind: 'expense',
      lastId: 'e',
      updatedAt: serverTimestamp(),
    }),
  )
  for (const sharing of [
    { payerId: 'sx', shares: { sa: 50, sb: 50 } },
    { payerId: 'sa', shares: { sa: 50, sx: 50 } },
    { payerId: 'sa', shares: { sa: 49, sb: 50 } },
    { payerId: 'sa', shares: { sa: 0.5, sb: 99.5 } },
    { payerId: 'sa', shares: { sa: -1, sb: 101 } },
    { payerId: 'sa', shares: { sa: 50, sb: 50, x: 0 } },
    { payerId: 'sa', shares: { sa: 50, sb: 50 }, extra: true },
  ])
    await no(() => create(a, 'bad', { sharing }, { version: 2 }))
  for (const patch of [
    { amount: 0 },
    { amount: 1.5 },
    { fromUid: 'sx' },
    { fromUid: 'sa', toUid: 'sa' },
    { date: '2026-02-29' },
    { month: '2026-11' },
    { canceledAt: serverTimestamp() },
    { createdBy: 'sb' },
    { createdAt: new Date(0) },
    { version: 2 },
    { extra: true },
  ])
    await no(() => payment(a, 'bad', 2, patch))
  for (const patch of [
    { netPaid: 49 },
    { version: 1 },
    { lastKind: 'expense' },
    { lastId: 'other' },
    { month: '2026-11' },
    { updatedBy: 'sb' },
    { extra: true },
  ])
    await no(() => payment(a, 'bad', 2, {}, patch))
  await yes(payment(a))
  await no(() =>
    updateDoc(ref(a, 'settlementPayments', 'p'), {
      amount: 1,
      version: 2,
      updatedAt: serverTimestamp(),
    }),
  )
  await no(() => deleteDoc(ref(a, 'settlementPayments', 'p')))
  await no(() => deleteDoc(ref(a, 'settlementMonths', '2026-10')))
  await no(() =>
    updateDoc(ref(a, 'settlementPayments', 'p'), {
      canceledAt: serverTimestamp(),
      canceledBy: 'sa',
      version: 2,
      updatedAt: serverTimestamp(),
    }),
  )
  const cancel = writeBatch(b)
  cancel.update(ref(b, 'settlementPayments', 'p'), {
    canceledAt: serverTimestamp(),
    canceledBy: 'sb',
    version: 2,
    updatedAt: serverTimestamp(),
    updatedBy: 'sb',
  })
  cancel.update(ref(b, 'settlementMonths', '2026-10'), {
    netPaid: 0,
    version: 3,
    lastKind: 'cancel',
    lastId: 'p',
    updatedAt: serverTimestamp(),
    updatedBy: 'sb',
  })
  await yes(cancel.commit())
  await no(() =>
    updateDoc(ref(a, 'settlementPayments', 'p'), {
      canceledAt: serverTimestamp(),
      canceledBy: 'sa',
      version: 3,
      updatedAt: serverTimestamp(),
      updatedBy: 'sa',
    }),
  )
  // Moving a shared expense requires both month revisions.
  const before = (await getDoc(ref(a, 'expenses', 'e'))).data()
  const move = (both) => {
    const batch = writeBatch(a)
    batch.update(ref(a, 'expenses', 'e'), {
      date: '2026-11-01',
      version: 2,
      updatedAt: serverTimestamp(),
    })
    batch.update(ref(a, 'settlementMonths', '2026-10'), {
      version: 4,
      lastKind: 'expense',
      lastId: 'e',
      updatedAt: serverTimestamp(),
      updatedBy: 'sa',
    })
    if (both)
      batch.set(
        ref(a, 'settlementMonths', '2026-11'),
        ledger({ month: '2026-11' }),
      )
    return batch.commit()
  }
  await no(() => move(false))
  await yes(move(true))
  assert.equal(
    (await getDoc(ref(a, 'expenses', 'e'))).data().version,
    before.version + 1,
  )
  // Metadata loss via set() is rejected even with matching guards.
  const lost = writeBatch(a)
  const e = (await getDoc(ref(a, 'expenses', 'e'))).data()
  delete e.sharing
  lost.set(ref(a, 'expenses', 'e'), {
    ...e,
    version: 3,
    updatedAt: serverTimestamp(),
  })
  lost.update(ref(a, 'settlementMonths', '2026-11'), {
    version: 2,
    lastId: 'e',
    lastKind: 'expense',
    updatedAt: serverTimestamp(),
  })
  await no(() => lost.commit())
  // Same month version: only one concurrent payment succeeds, loser is permission-denied.
  const races = await Promise.allSettled([
    payment(a, 'race1', 5, {}, { netPaid: 50 }),
    payment(a, 'race2', 5, {}, { netPaid: 50 }),
  ])
  assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    races.find((r) => r.status === 'rejected').reason.code,
    'permission-denied',
  )
  const final = (await getDoc(ref(a, 'settlementMonths', '2026-10'))).data()
  assert.equal(final.version, 5)
  assert.equal(final.netPaid, 50)
  // Transaction race: a displayed month revision cannot be reused after another operation.
  await assert.rejects(
    runTransaction(a, async (tx) => {
      const s = await tx.get(ref(a, 'settlementMonths', '2026-10'))
      if (s.data().version !== 4)
        throw Object.assign(new Error('conflict'), { code: 'finance-conflict' })
    }),
    (e) => e.code === 'finance-conflict',
  )
  // A second payer, 0/100 percentages, explicit exclusion, and legacy documents remain valid.
  const e2 = writeBatch(b)
  e2.set(
    ref(b, 'expenses', 'second'),
    expense({
      date: '2026-11-02',
      sharing: { payerId: 'sb', shares: { sa: 0, sb: 100 } },
      createdBy: 'sb',
      updatedBy: 'sb',
    }),
  )
  e2.update(ref(b, 'settlementMonths', '2026-11'), {
    version: 2,
    lastKind: 'expense',
    lastId: 'second',
    updatedAt: serverTimestamp(),
    updatedBy: 'sb',
  })
  await yes(e2.commit())
  const excluded = writeBatch(a)
  excluded.update(ref(a, 'expenses', 'second'), {
    sharing: null,
    version: 2,
    updatedAt: serverTimestamp(),
    updatedBy: 'sa',
  })
  excluded.update(ref(a, 'settlementMonths', '2026-11'), {
    version: 3,
    lastKind: 'expense',
    lastId: 'second',
    updatedAt: serverTimestamp(),
    updatedBy: 'sa',
  })
  await yes(excluded.commit())
  await yes(deleteDoc(ref(b, 'expenses', 'second')))
  const legacy = expense()
  delete legacy.sharing
  await yes(setDoc(ref(a, 'expenses', 'legacy'), legacy))
  await yes(
    updateDoc(ref(b, 'expenses', 'legacy'), {
      amount: 7,
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'sb',
    }),
  )
  await yes(deleteDoc(ref(b, 'expenses', 'legacy')))
  for (const key of Object.keys(pay())) {
    const d = pay()
    delete d[key]
    await no(() => {
      const batch = writeBatch(a)
      batch.set(ref(a, 'settlementPayments', 'missing'), d)
      batch.update(ref(a, 'settlementMonths', '2026-10'), {
        netPaid: 100,
        version: 6,
        lastKind: 'payment',
        lastId: 'missing',
        updatedAt: serverTimestamp(),
        updatedBy: 'sa',
      })
      return batch.commit()
    })
  }
  for (const key of Object.keys(ledger())) {
    const d = ledger({
      version: 6,
      netPaid: 100,
      lastKind: 'payment',
      lastId: 'missing',
    })
    delete d[key]
    await no(() => {
      const batch = writeBatch(a)
      batch.set(ref(a, 'settlementPayments', 'missing'), pay())
      batch.set(ref(a, 'settlementMonths', '2026-10'), d)
      return batch.commit()
    })
  }
  // Cancellation racing with expense edit: one revision succeeds; rejected operation is atomic.
  const activePayment = final.lastId
  const active = (
    await getDoc(ref(a, 'settlementPayments', activePayment))
  ).data()
  const competingCancel = writeBatch(a)
  competingCancel.update(ref(a, 'settlementPayments', activePayment), {
    canceledAt: serverTimestamp(),
    canceledBy: 'sa',
    version: active.version + 1,
    updatedAt: serverTimestamp(),
    updatedBy: 'sa',
  })
  competingCancel.update(ref(a, 'settlementMonths', '2026-10'), {
    netPaid: 0,
    version: 6,
    lastKind: 'cancel',
    lastId: activePayment,
    updatedAt: serverTimestamp(),
    updatedBy: 'sa',
  })
  const otherExpense = writeBatch(b)
  otherExpense.set(
    ref(b, 'expenses', 'race-edit'),
    expense({ createdBy: 'sb', updatedBy: 'sb' }),
  )
  otherExpense.update(ref(b, 'settlementMonths', '2026-10'), {
    version: 6,
    lastKind: 'expense',
    lastId: 'race-edit',
    updatedAt: serverTimestamp(),
    updatedBy: 'sb',
  })
  const editRace = await Promise.allSettled([
    competingCancel.commit(),
    otherExpense.commit(),
  ])
  assert.equal(editRace.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    editRace.find((r) => r.status === 'rejected').reason.code,
    'permission-denied',
  )
  const afterRace = (await getDoc(ref(a, 'settlementMonths', '2026-10'))).data()
  assert.equal(afterRace.version, 6)
  const canceled = !!(
    await getDoc(ref(a, 'settlementPayments', activePayment))
  ).data().canceledAt
  assert.equal(afterRace.netPaid, canceled ? 0 : 50)
  assert.equal(
    (await getDoc(ref(a, 'expenses', 'race-edit'))).exists(),
    !canceled,
  )
  console.log(
    `Settlement rules passed: ${allowed} allowed / ${denied} denied, atomic guards, legacy protection, cancellation, races and immutable rejection`,
  )
} finally {
  await env.cleanup()
}
