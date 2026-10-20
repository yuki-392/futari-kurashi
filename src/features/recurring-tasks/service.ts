import { cleaningFields, rotatedAssignees } from '../cleaning/model'
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import type { DocumentSnapshot, QueryConstraint } from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import { tokyoDate } from '../tasks/model'
import { historyId, nextDate, validateRecurring } from './model'
import type {
  Recurring,
  RecurringInput,
  Completion,
  RecurringQuery,
} from './model'
const conflict = () =>
  Object.assign(new Error('recurring conflict'), { code: 'recurring-conflict' })
function online() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error('offline'), { code: 'offline' })
}
function current(snapshot: DocumentSnapshot, version: number): Recurring {
  if (!snapshot.exists() || snapshot.data().version !== version)
    throw conflict()
  return { ...snapshot.data(), id: snapshot.id } as Recurring
}
const audit = (uid: string, version: number) => ({
  updatedBy: uid,
  updatedAt: serverTimestamp(),
  version: version + 1,
})
export async function createRecurring(
  hid: string,
  uid: string,
  input: RecurringInput,
  members: string[],
) {
  online()
  const data = validateRecurring(input, members)
  if (data.startDate !== data.nextDueDate)
    throw new Error('初回予定は開始日と同じ日付にしてください。')
  const { db } = await getFirebaseServices(),
    target = doc(collection(db, 'households', hid, 'recurringTasks'))
  await runTransaction(db, async (tx) => {
    if ((await tx.get(target)).exists()) throw conflict()
    tx.set(target, {
      ...data,
      active: true,
      version: 1,
      lastCompletionId: null,
      lastAction: 'create',
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    })
  })
}
export async function editRecurring(
  hid: string,
  uid: string,
  expected: Recurring,
  input: RecurringInput,
  members: string[],
) {
  online()
  const data = validateRecurring(input, members),
    { db } = await getFirebaseServices(),
    target = doc(db, 'households', hid, 'recurringTasks', expected.id)
  await runTransaction(db, async (tx) => {
    current(await tx.get(target), expected.version)
    tx.update(target, {
      ...data,
      ...audit(uid, expected.version),
      lastCompletionId: null,
      lastAction: 'edit',
    })
  })
}
export async function setRecurringActive(
  hid: string,
  uid: string,
  expected: Recurring,
  active: boolean,
) {
  online()
  const { db } = await getFirebaseServices(),
    target = doc(db, 'households', hid, 'recurringTasks', expected.id)
  await runTransaction(db, async (tx) => {
    current(await tx.get(target), expected.version)
    tx.update(target, {
      active,
      lastCompletionId: null,
      lastAction: active ? 'resume' : 'pause',
      ...audit(uid, expected.version),
    })
  })
}
export async function completeRecurring(
  hid: string,
  uid: string,
  expected: Recurring,
) {
  online()
  const { db } = await getFirebaseServices(),
    target = doc(db, 'households', hid, 'recurringTasks', expected.id)
  await runTransaction(db, async (tx) => {
    const value = current(await tx.get(target), expected.version)
    if (!value.active) throw conflict()
    const next = nextDate(value, tokyoDate()),
      id = historyId(expected.id, value.version + 1)
    const members =
      value.rotation === 'alternate'
        ? ((await tx.get(doc(db, 'households', hid))).data()
            ?.memberIds as string[])
        : value.assigneeIds
    const assigneeIds = rotatedAssignees(value, members)
    tx.set(doc(db, 'households', hid, 'recurringCompletions', id), {
      ...cleaningFields(value),
      scheduleId: expected.id,
      scheduleVersion: value.version + 1,
      title: value.title,
      assigneeIds: value.assigneeIds,
      priority: value.priority,
      frequency: value.frequency,
      startDate: value.startDate,
      scheduledDate: value.nextDueDate,
      nextDueDate: next,
      completedAt: serverTimestamp(),
      completedBy: uid,
      cancelledAt: null,
      cancelledBy: null,
    })
    tx.update(target, {
      assigneeIds,
      nextDueDate: next,
      lastCompletionId: id,
      lastAction: 'complete',
      ...audit(uid, value.version),
    })
  })
}
export async function undoRecurring(
  hid: string,
  uid: string,
  expected: Completion,
) {
  online()
  const { db } = await getFirebaseServices(),
    target = doc(db, 'households', hid, 'recurringTasks', expected.scheduleId),
    record = doc(db, 'households', hid, 'recurringCompletions', expected.id)
  await runTransaction(db, async (tx) => {
    const schedule = await tx.get(target),
      snapshot = await tx.get(record)
    if (!snapshot.exists()) throw conflict()
    const history = snapshot.data() as Completion,
      value = current(schedule, expected.scheduleVersion)
    if (
      history.cancelledAt !== null ||
      value.lastCompletionId !== expected.id ||
      history.scheduleVersion !== expected.scheduleVersion
    )
      throw conflict()
    tx.update(record, { cancelledAt: serverTimestamp(), cancelledBy: uid })
    tx.update(target, {
      ...(history.assigneeIds ? { assigneeIds: history.assigneeIds } : {}),
      nextDueDate: history.scheduledDate,
      lastCompletionId: null,
      lastAction: 'undo',
      ...audit(uid, value.version),
    })
  })
}
export function watchRecurring<T extends Recurring | Completion>(
  hid: string,
  options: RecurringQuery,
  next: (items: T[], more: boolean) => void,
  error: () => void,
) {
  let active = true,
    stop: (() => void) | undefined
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      const constraints: QueryConstraint[] = [
        orderBy(
          options.kind === 'history' ? 'completedAt' : 'nextDueDate',
          options.kind === 'history' ? 'desc' : 'asc',
        ),
        limit(options.count + 1),
      ]
      if (options.kind === 'cleaning') {
        constraints.push(
          where('taskType', '==', 'cleaning'),
          where('active', '==', true),
          where('nextDueDate', '<=', options.end),
        )
        if (options.place) constraints.push(where('place', '==', options.place))
      }
      if (options.kind === 'today')
        constraints.push(
          where('active', '==', true),
          where('nextDueDate', '<=', options.today),
        )
      stop = onSnapshot(
        query(
          collection(
            db,
            'households',
            hid,
            options.kind === 'history'
              ? 'recurringCompletions'
              : 'recurringTasks',
          ),
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
              .map((item) => ({ ...item.data(), id: item.id }) as T),
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

export function watchUndoTargets(
  hid: string,
  ids: string[],
  next: (targets: Record<string, Recurring | null>) => void,
) {
  let active = true
  const stops: (() => void)[] = [],
    values: Record<string, Recurring | null> = {}
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      for (const id of [...new Set(ids)])
        stops.push(
          onSnapshot(
            doc(db, 'households', hid, 'recurringTasks', id),
            { includeMetadataChanges: true },
            (snapshot) => {
              if (
                !active ||
                snapshot.metadata.fromCache ||
                snapshot.metadata.hasPendingWrites
              )
                return
              values[id] = snapshot.exists()
                ? ({ ...snapshot.data(), id } as Recurring)
                : null
              next({ ...values })
            },
            () => {
              if (active) {
                values[id] = null
                next({ ...values })
              }
            },
          ),
        )
    })
    .catch(() => {
      if (active) next({})
    })
  return () => {
    active = false
    for (const stop of stops) stop()
  }
}
