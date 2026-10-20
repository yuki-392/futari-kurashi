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
import { cleanShoppingInput } from './model'
import type { ShoppingItem, ShoppingInput, ShoppingQuery } from './model'
const conflict = () =>
  Object.assign(new Error('shopping conflict'), { code: 'shopping-conflict' })
function requireOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error('offline'), { code: 'offline' })
}
export async function createShopping(
  householdId: string,
  uid: string,
  input: ShoppingInput,
  members: string[],
) {
  requireOnline()
  const data = cleanShoppingInput(input, members)
  const { db } = await getFirebaseServices()
  const target = doc(collection(db, 'households', householdId, 'shoppingItems'))
  await runTransaction(db, async (tx) => {
    if ((await tx.get(target)).exists()) throw conflict()
    tx.set(target, {
      ...data,
      purchased: false,
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    })
  })
}
export async function changeShopping(
  householdId: string,
  uid: string,
  expected: ShoppingItem,
  patch: Partial<ShoppingInput & { purchased: boolean }>,
  members: string[],
) {
  requireOnline()
  const { db } = await getFirebaseServices()
  const target = doc(
    db,
    'households',
    householdId,
    'shoppingItems',
    expected.id,
  )
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(target)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    const current = snapshot.data() as ShoppingItem
    const data = cleanShoppingInput({ ...current, ...patch }, members)
    tx.update(target, {
      ...data,
      purchased: patch.purchased ?? current.purchased,
      version: current.version + 1,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    })
  })
}
export async function removeShopping(
  householdId: string,
  _uid: string,
  expected: ShoppingItem,
) {
  requireOnline()
  const { db } = await getFirebaseServices()
  const target = doc(
    db,
    'households',
    householdId,
    'shoppingItems',
    expected.id,
  )
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(target)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    tx.delete(target)
  })
}
export function watchShopping(
  householdId: string,
  options: ShoppingQuery,
  next: (items: ShoppingItem[], more: boolean) => void,
  error: () => void,
) {
  let active = true
  let stop: (() => void) | undefined
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      const constraints: QueryConstraint[] = [
        where('purchased', '==', options.purchased),
        limit(options.count + 1),
      ]
      if (options.purchased) constraints.push(orderBy('updatedAt', 'desc'))
      else
        constraints.push(
          orderBy('priority', 'desc'),
          orderBy('createdAt', 'desc'),
        )
      if (options.category)
        constraints.push(where('category', '==', options.category))
      stop = onSnapshot(
        query(
          collection(db, 'households', householdId, 'shoppingItems'),
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
              .map((item) => ({ ...item.data(), id: item.id }) as ShoppingItem),
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
