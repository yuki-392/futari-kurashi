import {
  collection,
  doc,
  getDocsFromServer,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import {
  budgetId,
  parseBudgetAmount,
  previousMonth,
  BUDGET_LIMIT,
} from './budgetModel'
import type { Budget } from './budgetModel'

function online() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error(), { code: 'offline' })
}
const conflict = () => Object.assign(new Error(), { code: 'finance-conflict' })
function sameVersion(current: Budget | undefined, expected: Budget | null) {
  if (!expected) return !current
  const millis = (value: unknown) =>
    value && typeof value === 'object' && 'toMillis' in value
      ? (value as { toMillis: () => number }).toMillis()
      : null
  return Boolean(
    current &&
    current.version === expected.version &&
    millis(current.createdAt) !== null &&
    millis(current.createdAt) === millis(expected.createdAt),
  )
}
function dataFor(
  month: string,
  categoryId: string | null,
  amount: number,
  uid: string,
  current?: Budget,
) {
  return {
    month,
    scope: categoryId === null ? 'total' : 'category',
    categoryId,
    amount,
    version: (current?.version ?? 0) + 1,
    createdAt: current?.createdAt ?? serverTimestamp(),
    createdBy: current?.createdBy ?? uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  }
}
export async function saveBudget(
  householdId: string,
  uid: string,
  month: string,
  categoryId: string | null,
  amount: number,
  expected: Budget | null,
) {
  online()
  parseBudgetAmount(String(amount))
  const id = budgetId(month, categoryId)
  if (expected && expected.id !== id) throw conflict()
  const { db } = await getFirebaseServices()
  const ref = doc(db, 'households', householdId, 'budgets', id)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref)
    const current = snapshot.exists() ? (snapshot.data() as Budget) : undefined
    if (!sameVersion(current, expected)) throw conflict()
    if (categoryId !== null) {
      const category = await tx.get(
        doc(db, 'households', householdId, 'financeCategories', categoryId),
      )
      if (
        !category.exists() ||
        category.data().type !== 'expense' ||
        category.data().archived
      )
        throw new Error('有効な支出カテゴリを選んでください。')
    }
    tx.set(ref, dataFor(month, categoryId, amount, uid, current))
  })
}
export async function removeBudget(householdId: string, expected: Budget) {
  online()
  const { db } = await getFirebaseServices(),
    ref = doc(
      db,
      'households',
      householdId,
      'budgets',
      budgetId(expected.month, expected.categoryId),
    )
  await runTransaction(db, async (tx) => {
    const current = await tx.get(ref)
    if (
      !sameVersion(
        current.exists() ? (current.data() as Budget) : undefined,
        expected,
      )
    )
      throw conflict()
    tx.delete(ref)
  })
}
export async function copyPreviousBudgets(
  householdId: string,
  uid: string,
  month: string,
) {
  online()
  const sourceMonth = previousMonth(month),
    { db } = await getFirebaseServices()
  const source = await getDocsFromServer(
    query(
      collection(db, 'households', householdId, 'budgets'),
      where('month', '==', sourceMonth),
      limit(BUDGET_LIMIT + 2),
    ),
  )
  if (source.size >= BUDGET_LIMIT + 2)
    throw new Error('前月の予算が取得上限に達したためコピーできません。')
  const result = { copied: 0, skipped: 0, failed: 0 }
  for (const item of source.docs) {
    try {
      const outcome = await runTransaction(db, async (tx) => {
        const ref = doc(
          db,
          'households',
          householdId,
          'budgets',
          budgetId(month, item.data().categoryId as string | null),
        )
        const originalRef = doc(
          db,
          'households',
          householdId,
          'budgets',
          item.id,
        )
        const [target, current] = await Promise.all([
          tx.get(ref),
          tx.get(originalRef),
        ])
        if (target.exists() || !current.exists()) return 'skipped' as const
        const original = current.data() as Budget
        if (original.categoryId !== null) {
          const category = await tx.get(
            doc(
              db,
              'households',
              householdId,
              'financeCategories',
              original.categoryId,
            ),
          )
          if (
            !category.exists() ||
            category.data().archived ||
            category.data().type !== 'expense'
          )
            return 'skipped' as const
        }
        tx.set(ref, dataFor(month, original.categoryId, original.amount, uid))
        return 'copied' as const
      })
      result[outcome]++
    } catch {
      result.failed++
    }
  }
  return result
}
export function watchBudgets(
  householdId: string,
  month: string,
  next: (items: Budget[], complete: boolean) => void,
  error: () => void,
  totalOnly = false,
) {
  let active = true,
    failed = false
  let stop: (() => void) | undefined
  const fail = () => {
    if (active && !failed) {
      failed = true
      error()
    }
  }
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      if (totalOnly) {
        stop = onSnapshot(
          doc(db, 'households', householdId, 'budgets', budgetId(month, null)),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (
              !active ||
              failed ||
              snapshot.metadata.fromCache ||
              snapshot.metadata.hasPendingWrites
            )
              return
            next(
              snapshot.exists()
                ? [{ ...snapshot.data(), id: snapshot.id } as Budget]
                : [],
              true,
            )
          },
          fail,
        )
      } else {
        budgetId(month, null)
        stop = onSnapshot(
          query(
            collection(db, 'households', householdId, 'budgets'),
            where('month', '==', month),
            limit(BUDGET_LIMIT + 2),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (
              !active ||
              failed ||
              snapshot.metadata.fromCache ||
              snapshot.metadata.hasPendingWrites
            )
              return
            next(
              snapshot.docs
                .slice(0, BUDGET_LIMIT + 1)
                .map((item) => ({ ...item.data(), id: item.id }) as Budget),
              snapshot.size < BUDGET_LIMIT + 2,
            )
          },
          fail,
        )
      }
    })
    .catch(fail)
  return () => {
    active = false
    stop?.()
  }
}
