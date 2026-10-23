import {
  collection,
  doc,
  limit,
  onSnapshot,
  onSnapshotsInSync,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import type { Transaction } from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import { cleanSharing, paymentInput } from './settlementModel'
import type { SettlementMonth, SettlementPayment } from './settlementModel'
import type { FinanceEntryInput, FinanceEntry } from './model'
export const settlementConflict = () =>
  Object.assign(new Error('settlement conflict'), { code: 'finance-conflict' })
function online() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error(), { code: 'offline' })
}

// Read every affected month before any transaction writes; moving an expense locks both months.
export async function prepareExpenseMonths(
  tx: Transaction,
  db: Awaited<ReturnType<typeof getFirebaseServices>>['db'],
  hid: string,
  uid: string,
  id: string,
  before: FinanceEntryInput | null,
  after: FinanceEntryInput | null,
) {
  if (after?.sharing) {
    const home = await tx.get(doc(db, 'households', hid))
    cleanSharing(after.sharing, home.data()!.memberIds)
  }
  const months = [
    ...new Set(
      [before, after].filter((e) => e?.sharing).map((e) => e!.date.slice(0, 7)),
    ),
  ]
  const refs = months.map((month) =>
    doc(db, 'households', hid, 'settlementMonths', month),
  )
  const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)))
  return () =>
    refs.forEach((ref, i) => {
      const old = snapshots[i]!.data() as SettlementMonth | undefined
      tx.set(ref, {
        month: months[i],
        netPaid: old?.netPaid ?? 0,
        version: (old?.version ?? 0) + 1,
        lastKind: 'expense',
        lastId: id,
        createdAt: old?.createdAt ?? serverTimestamp(),
        createdBy: old?.createdBy ?? uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      })
    })
}
export async function recordSettlementPayment(
  hid: string,
  uid: string,
  raw: Pick<
    SettlementPayment,
    'month' | 'fromUid' | 'toUid' | 'amount' | 'date'
  >,
  expectedVersion: number,
) {
  online()
  const { db } = await getFirebaseServices()
  const paymentRef = doc(
    collection(db, 'households', hid, 'settlementPayments'),
  )
  const monthRef = doc(db, 'households', hid, 'settlementMonths', raw.month)
  await runTransaction(db, async (tx) => {
    const [house, month] = await Promise.all([
      tx.get(doc(db, 'households', hid)),
      tx.get(monthRef),
    ])
    const data = paymentInput(
      raw.month,
      raw.fromUid,
      raw.toUid,
      raw.amount,
      raw.date,
      house.data()!.memberIds,
    )
    const previous = month.data() as SettlementMonth | undefined
    if ((previous?.version ?? 0) !== expectedVersion) throw settlementConflict()
    const delta =
      data.toUid === house.data()!.ownerId ? data.amount : -data.amount
    const netPaid = (previous?.netPaid ?? 0) + delta
    if (!Number.isSafeInteger(netPaid) || Math.abs(netPaid) > 999999999999999)
      throw new Error('精算金の累計が上限を超えます。')
    tx.set(paymentRef, {
      ...data,
      version: 1,
      canceledAt: null,
      canceledBy: null,
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
    tx.set(monthRef, {
      month: data.month,
      netPaid,
      version: expectedVersion + 1,
      lastKind: 'payment',
      lastId: paymentRef.id,
      createdAt: previous?.createdAt ?? serverTimestamp(),
      createdBy: previous?.createdBy ?? uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}
export async function cancelSettlementPayment(
  hid: string,
  uid: string,
  expected: SettlementPayment,
  expectedMonthVersion: number,
) {
  online()
  const { db } = await getFirebaseServices()
  const ref = doc(db, 'households', hid, 'settlementPayments', expected.id),
    monthRef = doc(db, 'households', hid, 'settlementMonths', expected.month)
  await runTransaction(db, async (tx) => {
    const [house, month, payment] = await Promise.all([
      tx.get(doc(db, 'households', hid)),
      tx.get(monthRef),
      tx.get(ref),
    ])
    const old = month.data() as SettlementMonth | undefined,
      p = payment.data() as SettlementPayment | undefined
    if (
      !old ||
      old.version !== expectedMonthVersion ||
      !p ||
      p.version !== expected.version ||
      p.canceledAt !== null
    )
      throw settlementConflict()
    const delta = p.toUid === house.data()!.ownerId ? p.amount : -p.amount
    const netPaid = old.netPaid - delta
    if (!Number.isSafeInteger(netPaid) || Math.abs(netPaid) > 999999999999999)
      throw new Error('精算金の累計が上限を超えます。')
    tx.update(ref, {
      version: p.version + 1,
      canceledAt: serverTimestamp(),
      canceledBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
    tx.update(monthRef, {
      netPaid,
      version: old.version + 1,
      lastKind: 'cancel',
      lastId: expected.id,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}
export type SettlementData = {
  expenses: FinanceEntry[]
  months: SettlementMonth[]
  payments: SettlementPayment[]
  complete: boolean
}
export function watchSettlements(
  hid: string,
  month: string,
  next: (data: SettlementData) => void,
  error: () => void,
) {
  let active = true,
    failed = false
  const stops: (() => void)[] = []
  const fail = () => {
    if (active && !failed) {
      failed = true
      error()
    }
  }
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      const groups = new Map<string, { id: string; [key: string]: unknown }[]>()
      const ready = new Set<string>()
      const sources = [
        ['expenses', [where('sharing.payerId', '!=', '')]],
        ['settlementMonths', []],
        ['settlementPayments', [where('month', '==', month)]],
      ] as const
      for (const [name, conditions] of sources)
        stops.push(
          onSnapshot(
            query(
              collection(db, 'households', hid, name),
              ...conditions,
              limit(10000),
            ),
            { includeMetadataChanges: true },
            (snapshot) => {
              if (!active || failed) return
              if (
                snapshot.metadata.fromCache ||
                snapshot.metadata.hasPendingWrites
              ) {
                ready.delete(name)
                return
              }
              ready.add(name)
              groups.set(
                name,
                snapshot.docs.map((d) => ({ ...d.data(), id: d.id })),
              )
            },
            fail,
          ),
        )
      stops.push(
        onSnapshotsInSync(db, () => {
          if (!active || failed || ready.size !== 3 || groups.size !== 3) return
          next({
            expenses: [...groups.get('expenses')!] as unknown as FinanceEntry[],
            months: [
              ...groups.get('settlementMonths')!,
            ] as unknown as SettlementMonth[],
            payments: (
              [
                ...groups.get('settlementPayments')!,
              ] as unknown as SettlementPayment[]
            ).sort((a, b) => b.date.localeCompare(a.date)),
            complete: [...groups.values()].every(
              (items) => items.length < 10000,
            ),
          })
        }),
      )
    })
    .catch(fail)
  return () => {
    active = false
    stops.forEach((stop) => stop())
  }
}
