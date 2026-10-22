import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import { cleanFinanceEntry, monthBounds, standardCategories } from './model'
import type {
  FinanceCategory,
  FinanceEntry,
  FinanceEntryInput,
  FinanceEntryQuery,
  FinanceType,
} from './model'

function requireOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error('offline'), { code: 'offline' })
}

const conflict = () =>
  Object.assign(new Error('finance conflict'), { code: 'finance-conflict' })

export async function ensureFinanceCategories(
  householdId: string,
  uid: string,
) {
  const { db } = await getFirebaseServices()
  const categories = [
    ...standardCategories.income.map((item) => ({
      ...item,
      type: 'income' as const,
    })),
    ...standardCategories.expense.map((item) => ({
      ...item,
      type: 'expense' as const,
    })),
  ]
  await runTransaction(db, async (tx) => {
    const refs = categories.map(({ id }) =>
      doc(db, 'households', householdId, 'financeCategories', id),
    )
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)))
    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) {
        const category = categories[index]!
        tx.set(refs[index]!, {
          type: category.type,
          name: category.name,
          archived: false,
          standard: true,
          version: 1,
          createdAt: serverTimestamp(),
          createdBy: uid,
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        })
      }
    })
  })
}

export async function createFinanceCategory(
  householdId: string,
  uid: string,
  type: FinanceType,
  rawName: string,
) {
  requireOnline()
  const name = rawName.trim()
  if (Array.from(name).length < 1 || Array.from(name).length > 40)
    throw new Error('カテゴリ名は1〜40文字で入力してください。')
  const { db } = await getFirebaseServices()
  const ref = doc(
    collection(db, 'households', householdId, 'financeCategories'),
  )
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) throw conflict()
    tx.set(ref, {
      type,
      name,
      archived: false,
      standard: false,
      version: 1,
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}

export async function changeFinanceCategory(
  householdId: string,
  uid: string,
  expected: FinanceCategory,
  change: { name?: string; archived?: boolean },
) {
  requireOnline()
  if (change.name !== undefined) {
    const name = change.name.trim()
    if (Array.from(name).length < 1 || Array.from(name).length > 40)
      throw new Error('カテゴリ名は1〜40文字で入力してください。')
    change = { ...change, name }
  }
  if (Object.keys(change).length !== 1)
    throw new Error('変更内容を選んでください。')
  const { db } = await getFirebaseServices()
  const ref = doc(
    db,
    'households',
    householdId,
    'financeCategories',
    expected.id,
  )
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    tx.update(ref, {
      ...change,
      version: expected.version + 1,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}

export async function createFinanceEntry(
  householdId: string,
  uid: string,
  input: FinanceEntryInput,
  categories: FinanceCategory[],
) {
  requireOnline()
  const data = cleanFinanceEntry(input, categories)
  const { db } = await getFirebaseServices()
  const collectionName = input.type === 'income' ? 'incomes' : 'expenses'
  const target = doc(collection(db, 'households', householdId, collectionName))
  await runTransaction(db, async (tx) => {
    if ((await tx.get(target)).exists()) throw conflict()
    tx.set(target, {
      ...data,
      version: 1,
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}

export async function changeFinanceEntry(
  householdId: string,
  uid: string,
  expected: FinanceEntry,
  input: FinanceEntryInput,
  categories: FinanceCategory[],
) {
  requireOnline()
  const data = cleanFinanceEntry(input, categories, true)
  const { db } = await getFirebaseServices()
  const currentCollection = expected.type === 'income' ? 'incomes' : 'expenses'
  if ((input.type === 'income' ? 'incomes' : 'expenses') !== currentCollection)
    throw new Error('収入・支出の種別は編集後も変更できません。')
  const currentRef = doc(
    db,
    'households',
    householdId,
    currentCollection,
    expected.id,
  )
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(currentRef)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    tx.update(currentRef, {
      ...data,
      version: expected.version + 1,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}

export async function removeFinanceEntry(
  householdId: string,
  expected: FinanceEntry,
) {
  requireOnline()
  const { db } = await getFirebaseServices()
  const collectionName = expected.type === 'income' ? 'incomes' : 'expenses'
  const ref = doc(db, 'households', householdId, collectionName, expected.id)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    tx.delete(ref)
  })
}

export function watchFinanceCategories(
  householdId: string,
  next: (items: FinanceCategory[]) => void,
  error: () => void,
) {
  let active = true
  let stop: (() => void) | undefined
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      stop = onSnapshot(
        query(
          collection(db, 'households', householdId, 'financeCategories'),
          orderBy('type'),
          limit(100),
        ),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (
            !snapshot.metadata.fromCache &&
            !snapshot.metadata.hasPendingWrites
          )
            next(
              snapshot.docs.map(
                (item) => ({ ...item.data(), id: item.id }) as FinanceCategory,
              ),
            )
        },
        () => {
          if (active) error()
        },
      )
    })
    .catch(() => {
      if (active) error()
    })
  return () => {
    active = false
    stop?.()
  }
}

export function watchFinanceEntries(
  householdId: string,
  options: FinanceEntryQuery,
  next: (items: FinanceEntry[], complete: boolean) => void,
  error: () => void,
) {
  let active = true
  let stop: (() => void) | undefined
  let failed = false
  const fail = () => {
    if (active && !failed) {
      failed = true
      error()
    }
  }
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      const { from, through } = monthBounds(options.month)
      const names = options.type
        ? [options.type === 'income' ? 'incomes' : 'expenses']
        : ['incomes', 'expenses']
      const snapshots = new Map<string, FinanceEntry[]>()
      const stops = names.map((name) =>
        onSnapshot(
          query(
            collection(db, 'households', householdId, name),
            where('date', '>=', from),
            where('date', '<=', through),
            orderBy('date', 'desc'),
            orderBy('createdAt', 'desc'),
            limit(10000),
          ),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (
              !active ||
              failed ||
              snapshot.metadata.hasPendingWrites ||
              snapshot.metadata.fromCache
            )
              return
            snapshots.set(
              name,
              snapshot.docs.map(
                (item) =>
                  ({
                    ...item.data(),
                    id: item.id,
                    type: name === 'incomes' ? 'income' : 'expense',
                  }) as FinanceEntry,
              ),
            )
            if (snapshots.size !== names.length) return
            const groups = [...snapshots.values()]
            next(
              groups
                .flat()
                .sort(
                  (a, b) =>
                    b.date.localeCompare(a.date) ||
                    dateMillis(b.createdAt) - dateMillis(a.createdAt),
                ),
              groups.every((items) => items.length < 10000),
            )
          },
          fail,
        ),
      )
      stop = () => stops.forEach((unsubscribe) => unsubscribe())
    })
    .catch(fail)
  return () => {
    active = false
    stop?.()
  }
}

function dateMillis(value: unknown) {
  return value && typeof value === 'object' && 'toMillis' in value
    ? (value as { toMillis: () => number }).toMillis()
    : 0
}
