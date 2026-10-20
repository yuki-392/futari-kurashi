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
import { getFirebaseServices } from '../../lib/firebase/client'
import { cleanInput } from './model'
import type { Task, TaskInput, TaskQuery } from './model'
const conflict = () =>
  Object.assign(new Error('task conflict'), { code: 'task-conflict' })
function requireOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error('offline'), { code: 'offline' })
}
export async function createTask(
  householdId: string,
  uid: string,
  input: TaskInput,
  members: string[],
) {
  requireOnline()
  const data = cleanInput(input, members)
  const { db } = await getFirebaseServices()
  const target = doc(collection(db, 'households', householdId, 'tasks'))
  await runTransaction(db, async (tx) => {
    if ((await tx.get(target)).exists()) throw conflict()
    tx.set(target, {
      ...data,
      completed: false,
      version: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    })
  })
}
export async function changeTask(
  householdId: string,
  uid: string,
  expected: Task,
  patch: Partial<TaskInput & { completed: boolean }>,
  members: string[],
) {
  requireOnline()
  const { db } = await getFirebaseServices()
  const target = doc(db, 'households', householdId, 'tasks', expected.id)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(target)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    const current = snapshot.data() as Task
    const data = cleanInput({ ...current, ...patch }, members)
    tx.update(target, {
      ...data,
      completed: patch.completed ?? current.completed,
      version: current.version + 1,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    })
  })
}
export async function removeTask(
  householdId: string,
  _uid: string,
  expected: Task,
) {
  requireOnline()
  const { db } = await getFirebaseServices()
  const target = doc(db, 'households', householdId, 'tasks', expected.id)
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(target)
    if (!snapshot.exists() || snapshot.data().version !== expected.version)
      throw conflict()
    tx.delete(target)
  })
}
export function watchTasks(
  householdId: string,
  options: TaskQuery,
  next: (tasks: Task[], more: boolean) => void,
  error: () => void,
) {
  let active = true
  let stop: (() => void) | undefined
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      const constraints = [
        where('completed', '==', options.completed),
        orderBy('createdAt', 'desc'),
        limit(options.count + 1),
      ]
      if (options.dueDate)
        constraints.push(where('dueDate', '==', options.dueDate))
      stop = onSnapshot(
        query(
          collection(db, 'households', householdId, 'tasks'),
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
              .map((item) => ({ ...item.data(), id: item.id }) as Task),
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
