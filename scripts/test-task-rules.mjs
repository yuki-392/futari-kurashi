import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  collectionGroup,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
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
const a = db('task-a'),
  b = db('task-b'),
  other = db('task-other'),
  none = db('task-none'),
  unverified = db('task-a', false),
  guest = env.unauthenticatedContext().firestore()
const path = 'households/task-home/tasks/'
const make = (patch = {}) => ({
  title: '掃除',
  assigneeIds: ['task-a'],
  dueDate: null,
  priority: 'medium',
  completed: false,
  version: 1,
  createdBy: 'task-a',
  updatedBy: 'task-a',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...patch,
})
let allows = 0,
  denies = 0
async function yes(p) {
  try {
    await assertSucceeds(p)
    allows++
  } catch (error) {
    throw new Error(`allow check ${allows + 1} failed`, { cause: error })
  }
}
async function no(p) {
  const e = await assertFails(p)
  assert.equal(e.code, 'permission-denied')
  denies++
}
async function stored(id) {
  let result
  await env.withSecurityRulesDisabled(async (c) => {
    result = (await getDoc(doc(c.firestore(), path + id))).data()
  })
  return result
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    await setDoc(doc(d, 'households/task-home'), {
      name: 'ToDoテスト',
      ownerId: 'task-a',
      memberIds: ['task-a', 'task-b'],
      activeInviteId: null,
      createdAt: Timestamp.now(),
    })
    for (const uid of ['task-a', 'task-b'])
      await setDoc(doc(d, 'users', uid), {
        householdId: 'task-home',
        createdAt: Timestamp.now(),
      })
    await setDoc(doc(d, 'households/task-other-home'), {
      name: '別世帯',
      ownerId: 'task-other',
      memberIds: ['task-other'],
      activeInviteId: null,
      createdAt: Timestamp.now(),
    })
    await setDoc(doc(d, 'users/task-other'), {
      householdId: 'task-other-home',
      createdAt: Timestamp.now(),
    })
  })
  await yes(setDoc(doc(a, path + 'valid'), make()))
  await yes(getDoc(doc(b, path + 'valid')))
  await yes(
    getDocs(
      query(
        collection(b, path.slice(0, -1)),
        where('completed', '==', false),
        orderBy('createdAt', 'desc'),
        limit(101),
      ),
    ),
  )
  await yes(
    getDocs(
      query(
        collection(a, path.slice(0, -1)),
        where('dueDate', '==', '2026-10-20'),
        where('completed', '==', false),
        orderBy('createdAt', 'desc'),
        limit(11),
      ),
    ),
  )
  for (const d of [other, none, unverified, guest]) {
    await no(getDoc(doc(d, path + 'valid')))
    await no(getDocs(query(collection(d, path.slice(0, -1)), limit(10))))
    await no(setDoc(doc(d, path + 'intrude'), make()))
    await no(
      updateDoc(doc(d, path + 'valid'), {
        title: '改ざん',
        version: 2,
        updatedAt: serverTimestamp(),
        updatedBy: 'task-a',
      }),
    )
    await no(deleteDoc(doc(d, path + 'valid')))
  }
  await no(getDocs(collection(a, path.slice(0, -1))))
  await no(getDocs(query(collectionGroup(a, 'tasks'), limit(10))))
  const invalid = [
    { title: '' },
    { title: ' '.repeat(2) },
    { title: 'あ'.repeat(101) },
    { title: ' 前後 ' },
    { title: 10 },
    { assigneeIds: ['task-other'] },
    { assigneeIds: ['task-a', 'task-a'] },
    { assigneeIds: 'task-a' },
    { dueDate: '2026-02-30' },
    { dueDate: '2025-02-29' },
    { dueDate: '2026-13-01' },
    { dueDate: '2026-1-01' },
    { dueDate: 10 },
    { priority: 'urgent' },
    { completed: 'false' },
    { version: 2 },
    { version: 1.1 },
    { createdBy: 'task-b' },
    { updatedBy: 'task-b' },
    { createdAt: Timestamp.fromMillis(1) },
    { updatedAt: Timestamp.fromMillis(1) },
    { extra: true },
  ]
  for (let i = 0; i < invalid.length; i++)
    await no(setDoc(doc(a, path + `bad-${i}`), make(invalid[i])))
  for (const field of Object.keys(make())) {
    const value = make()
    delete value[field]
    await no(setDoc(doc(a, path + 'missing-' + field), value))
  }
  for (const [i, assigneeIds] of [
    [],
    ['task-b'],
    ['task-a', 'task-b'],
  ].entries())
    await yes(
      setDoc(
        doc(a, path + `assign-${i}`),
        make({ assigneeIds, dueDate: '2028-02-29' }),
      ),
    )
  await yes(setDoc(doc(a, path + 'unicode'), make({ title: '🏠'.repeat(100) })))
  const before = await stored('valid')
  assert.equal(before.version, 1)
  for (const patch of [
    { version: 1 },
    { version: 3 },
    { createdBy: 'task-b' },
    { createdAt: serverTimestamp() },
    { updatedBy: 'task-a' },
    { updatedAt: Timestamp.fromMillis(0) },
    { assigneeIds: ['task-other'] },
    { title: '' },
    { extra: 1 },
  ]) {
    await no(
      updateDoc(doc(b, path + 'valid'), {
        title: '編集',
        version: 2,
        updatedBy: 'task-b',
        updatedAt: serverTimestamp(),
        ...patch,
      }),
    )
    assert.deepEqual(await stored('valid'), before)
  }
  await yes(
    updateDoc(doc(b, path + 'valid'), {
      title: '相手が編集',
      assigneeIds: [],
      completed: true,
      version: 2,
      updatedBy: 'task-b',
      updatedAt: serverTimestamp(),
    }),
  )
  await no(
    updateDoc(doc(a, path + 'valid'), {
      title: '古い版',
      version: 2,
      updatedBy: 'task-a',
      updatedAt: serverTimestamp(),
    }),
  )
  await yes(
    updateDoc(doc(a, path + 'valid'), {
      completed: false,
      version: 3,
      updatedBy: 'task-a',
      updatedAt: serverTimestamp(),
    }),
  )
  const batch = writeBatch(a)
  batch.update(doc(a, path + 'valid'), {
    title: 'まとめて改ざん',
    version: 4,
    updatedBy: 'task-a',
    updatedAt: serverTimestamp(),
  })
  batch.set(doc(a, 'households/task-other-home/tasks/mixed'), make())
  const current = await stored('valid')
  await no(batch.commit())
  assert.deepEqual(await stored('valid'), current)
  await yes(deleteDoc(doc(b, path + 'valid')))
  assert.equal(await stored('valid'), undefined)
  await yes(setDoc(doc(a, path + 'race'), make()))
  const outcomes = await Promise.allSettled([
    updateDoc(doc(a, path + 'race'), {
      title: '自分の同時編集',
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'task-a',
    }),
    updateDoc(doc(b, path + 'race'), {
      title: '相手の同時編集',
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'task-b',
    }),
  ])
  assert.equal(
    outcomes.filter((result) => result.status === 'fulfilled').length,
    1,
  )
  const rejected = outcomes.find((result) => result.status === 'rejected')
  assert.equal(rejected.reason.code, 'permission-denied')
  denies++
  allows++
  const saved = await stored('race')
  assert.equal(saved.version, 2)
  assert(['自分の同時編集', '相手の同時編集'].includes(saved.title))
  console.log(
    `PASS: task rules ${allows} allow / ${denies} deny; household isolation, finite queries, direct validation, audit, versions, atomic rejection, delete`,
  )
} finally {
  await env.cleanup()
}
