import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import type { QueryConstraint } from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import { cleanDeclutterInput, completionChange } from './model'
import type { DeclutterItem, DeclutterInput, DeclutterQuery } from './model'
const conflict = () =>
  Object.assign(new Error('declutter conflict'), { code: 'declutter-conflict' })
function requireOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error('offline'), { code: 'offline' })
}
export async function createDeclutter(
  householdId: string,
  uid: string,
  input: DeclutterInput,
  members: string[],
) {
  requireOnline()
  const data = cleanDeclutterInput(input, members)
  const { db } = await getFirebaseServices()
  const target = doc(
    collection(db, 'households', householdId, 'declutterItems'),
  )
  await runTransaction(db, async (tx) => {
    if ((await tx.get(target)).exists()) throw conflict()
    tx.set(target, {
      ...data,
      sortDueDate: data.dueDate ?? '~',
      completed: false,
      completedAt: null,
      completedBy: null,
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    })
  })
}
export async function changeDeclutter(
  householdId: string,
  uid: string,
  expected: DeclutterItem,
  patch: Partial<DeclutterInput & { completed: boolean }>,
  members: string[],
) {
  requireOnline()
  const { db } = await getFirebaseServices()
  const target = doc(
    db,
    'households',
    householdId,
    'declutterItems',
    expected.id,
  )
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(target)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    const current = snapshot.data() as DeclutterItem
    const data = cleanDeclutterInput({ ...current, ...patch }, members)
    tx.update(target, {
      ...data,
      sortDueDate: data.dueDate ?? '~',
      ...completionChange(
        current,
        patch.completed ?? current.completed,
        data.method,
        uid,
        serverTimestamp(),
      ),
      version: current.version + 1,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    })
  })
}
export async function removeDeclutter(
  householdId: string,
  _uid: string,
  expected: DeclutterItem,
) {
  requireOnline()
  const { db } = await getFirebaseServices()
  const target = doc(
    db,
    'households',
    householdId,
    'declutterItems',
    expected.id,
  )
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(target)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    tx.delete(target)
  })
}
export function watchDeclutter(
  householdId: string,
  options: DeclutterQuery,
  next: (items: DeclutterItem[], more: boolean) => void,
  error: () => void,
) {
  let active = true
  let stop: (() => void) | undefined
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      const constraints: QueryConstraint[] = [
        where('completed', '==', options.completed),
        limit(options.count + 1),
      ]
      if (options.completed) constraints.push(orderBy('completedAt', 'desc'))
      else
        constraints.push(
          orderBy('sortDueDate', 'asc'),
          orderBy('createdAt', 'desc'),
        )
      if (options.method)
        constraints.push(where('method', '==', options.method))
      if (options.through)
        constraints.push(where('sortDueDate', '<=', options.through))
      stop = onSnapshot(
        query(
          collection(db, 'households', householdId, 'declutterItems'),
          ...constraints,
        ),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (
            !active ||
            snapshot.metadata.hasPendingWrites ||
            snapshot.metadata.fromCache
          )
            return
          next(
            snapshot.docs
              .slice(0, options.count)
              .map(
                (item) => ({ ...item.data(), id: item.id }) as DeclutterItem,
              ),
            snapshot.docs.length > options.count,
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
