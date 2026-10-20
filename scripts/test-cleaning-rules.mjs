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
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  writeBatch,
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
const context = (uid, verified = true) =>
  env
    .authenticatedContext(uid, {
      email: `${uid}@example.test`,
      email_verified: verified,
    })
    .firestore()
const a = context('clean-a'),
  b = context('clean-b'),
  other = context('clean-other'),
  none = context('clean-none'),
  unverified = context('clean-a', false),
  guest = env.unauthenticatedContext().firestore()
const root = 'households/clean-home/',
  p = (id) => root + 'recurringTasks/' + id,
  h = (id) => root + 'recurringCompletions/' + id
let allows = 0,
  denies = 0
async function yes(x) {
  try {
    await assertSucceeds(x)
    allows++
  } catch (e) {
    throw new Error(`allow ${allows + 1}`, { cause: e })
  }
}
async function no(x) {
  const e = await assertFails(x)
  assert.equal(e.code, 'permission-denied')
  denies++
}
const base = {
  title: '台所掃除',
  assigneeIds: ['clean-a'],
  priority: 'medium',
  frequency: 'daily',
  startDate: '2096-01-01',
  nextDueDate: '2096-01-01',
  active: true,
  version: 1,
  lastCompletionId: null,
  lastAction: 'create',
  createdAt: serverTimestamp(),
  createdBy: 'clean-a',
  updatedAt: serverTimestamp(),
  updatedBy: 'clean-a',
}
const meta = { taskType: 'cleaning', place: '台所', rotation: 'alternate' }
const audit = (uid, version) => ({
  version,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
})
async function inspect(paths) {
  const out = {}
  await env.withSecurityRulesDisabled(async (c) => {
    for (const path of paths) {
      const s = await getDoc(doc(c.firestore(), path))
      out[path] = s.exists() ? s.data() : null
    }
  })
  return out
}
async function unchanged(paths, operation) {
  const old = await inspect(paths)
  await no(operation())
  assert.deepEqual(await inspect(paths), old)
}
function complete(
  db,
  id,
  patch = {},
  recordPatch = {},
  version = 1,
  next = '2096-01-02',
  from = base,
) {
  const uid = db === b ? 'clean-b' : 'clean-a',
    batch = writeBatch(db),
    record = `${id}_${version + 1}`
  batch.update(doc(db, p(id)), {
    nextDueDate: next,
    assigneeIds: ['clean-b'],
    lastCompletionId: record,
    lastAction: 'complete',
    ...audit(uid, version + 1),
    ...patch,
  })
  batch.set(doc(db, h(record)), {
    scheduleId: id,
    scheduleVersion: version + 1,
    title: from.title,
    assigneeIds: from.assigneeIds,
    priority: from.priority,
    frequency: from.frequency,
    startDate: from.startDate,
    scheduledDate: from.nextDueDate,
    nextDueDate: next,
    ...meta,
    completedAt: serverTimestamp(),
    completedBy: uid,
    cancelledAt: null,
    cancelledBy: null,
    ...recordPatch,
  })
  return batch.commit()
}
function undo(db, id, patch = {}, version = 2, recordVersion = 2) {
  const uid = db === b ? 'clean-b' : 'clean-a',
    batch = writeBatch(db)
  batch.update(doc(db, p(id)), {
    nextDueDate: base.nextDueDate,
    assigneeIds: ['clean-a'],
    lastCompletionId: null,
    lastAction: 'undo',
    ...audit(uid, version + 1),
    ...patch,
  })
  batch.update(doc(db, h(`${id}_${recordVersion}`)), {
    cancelledAt: serverTimestamp(),
    cancelledBy: uid,
  })
  return batch.commit()
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    await setDoc(doc(db, 'households/clean-home'), {
      memberIds: ['clean-a', 'clean-b'],
      ownerId: 'clean-a',
    })
    for (const uid of ['clean-a', 'clean-b'])
      await setDoc(doc(db, 'users', uid), { householdId: 'clean-home' })
    await setDoc(doc(db, 'households/clean-other'), {
      memberIds: ['clean-other'],
      ownerId: 'clean-other',
    })
    await setDoc(doc(db, 'users/clean-other'), { householdId: 'clean-other' })
  })
  await yes(setDoc(doc(a, p('valid')), { ...base, ...meta }))
  await yes(getDoc(doc(b, p('valid'))))
  for (const place of ['', '台所'])
    await yes(
      getDocs(
        query(
          collection(b, root + 'recurringTasks'),
          where('taskType', '==', 'cleaning'),
          where('active', '==', true),
          where('nextDueDate', '<=', '2096-01-07'),
          ...(place ? [where('place', '==', place)] : []),
          orderBy('nextDueDate'),
          limit(101),
        ),
      ),
    )
  for (const db of [other, none, unverified, guest]) {
    await no(getDoc(doc(db, p('valid'))))
    await no(setDoc(doc(db, p('intrude')), { ...base, ...meta }))
    await no(getDocs(query(collection(db, root + 'recurringTasks'), limit(10))))
  }
  for (const patch of [
    { place: '' },
    { place: ' x ' },
    { place: 'x'.repeat(41) },
    { place: 3 },
    { place: 'x\ny' },
    { taskType: 'bad' },
    { rotation: 'bad' },
    { rotation: true },
    { assigneeIds: [] },
    { assigneeIds: ['clean-a', 'clean-b'] },
    { assigneeIds: ['clean-other'] },
    { extra: true },
  ])
    await unchanged([p('bad')], () =>
      setDoc(doc(a, p('bad')), { ...base, ...meta, ...patch }),
    )
  for (const key of ['taskType', 'place', 'rotation']) {
    const data = { ...base, ...meta }
    delete data[key]
    await no(setDoc(doc(a, p('partial')), data))
  }
  await yes(
    setDoc(doc(a, p('general')), {
      ...base,
      taskType: 'general',
      place: '',
      rotation: 'fixed',
    }),
  )
  await yes(setDoc(doc(a, p('legacy')), base))
  await yes(
    updateDoc(doc(a, p('legacy')), {
      ...meta,
      lastAction: 'edit',
      ...audit('clean-a', 2),
    }),
  )
  await yes(
    setDoc(doc(a, p('length40')), { ...base, ...meta, place: 'x'.repeat(40) }),
  )
  for (const patch of [
    { assigneeIds: ['clean-a'] },
    { assigneeIds: [] },
    { assigneeIds: ['clean-other'] },
    { nextDueDate: '2096-01-03' },
    { place: '別の場所' },
    { rotation: 'fixed' },
    { updatedBy: 'clean-b' },
    { version: 4 },
  ])
    await unchanged([p('valid'), h('valid_2')], () =>
      complete(a, 'valid', patch),
    )
  for (const patch of [
    { place: '別の場所' },
    { rotation: 'fixed' },
    { taskType: 'general' },
    { assigneeIds: ['clean-b'] },
    { completedBy: 'clean-b' },
    { completedAt: Timestamp.fromMillis(0) },
    { extra: true },
  ])
    await unchanged([p('valid'), h('valid_2')], () =>
      complete(a, 'valid', {}, patch),
    )
  await yes(complete(b, 'valid'))
  const saved = await inspect([p('valid'), h('valid_2')])
  assert.deepEqual(saved[p('valid')].assigneeIds, ['clean-b'])
  assert.deepEqual(saved[h('valid_2')].assigneeIds, ['clean-a'])
  assert.equal(saved[h('valid_2')].completedBy, 'clean-b')
  await unchanged([p('valid'), h('valid_2')], () =>
    undo(a, 'valid', { assigneeIds: ['clean-b'] }),
  )
  await yes(undo(a, 'valid'))
  const restored = await inspect([p('valid'), h('valid_2')])
  assert.deepEqual(restored[p('valid')].assigneeIds, ['clean-a'])
  assert.equal(restored[p('valid')].nextDueDate, base.nextDueDate)
  assert.equal(restored[h('valid_2')].cancelledBy, 'clean-a')
  await unchanged([p('valid'), h('valid_2')], () => undo(b, 'valid', {}, 3))
  await yes(complete(a, 'valid', {}, {}, 3))
  await yes(
    updateDoc(doc(a, p('valid')), {
      active: false,
      lastAction: 'pause',
      lastCompletionId: null,
      ...audit('clean-a', 5),
    }),
  )
  await unchanged([p('valid'), h('valid_4')], () => undo(b, 'valid', {}, 5, 4))
  await yes(
    updateDoc(doc(b, p('valid')), {
      active: true,
      lastAction: 'resume',
      ...audit('clean-b', 6),
    }),
  )
  await unchanged([p('valid')], () => deleteDoc(doc(a, p('valid'))))
  await unchanged([h('valid_4')], () => deleteDoc(doc(a, h('valid_4'))))
  await unchanged([h('valid_4')], () =>
    updateDoc(doc(a, h('valid_4')), { place: '別の場所' }),
  )
  await yes(setDoc(doc(a, p('legacy-complete')), base))
  await yes(
    complete(
      a,
      'legacy-complete',
      { assigneeIds: ['clean-a'] },
      { taskType: 'general', place: '', rotation: 'fixed' },
    ),
  )
  // New metadata must also stay within Rules expression limits at month/year boundaries.
  const monthly = {
    ...base,
    frequency: 'monthly',
    startDate: '2096-01-31',
    nextDueDate: '2096-01-31',
  }
  await yes(setDoc(doc(a, p('monthly')), { ...monthly, ...meta }))
  await unchanged([p('monthly'), h('monthly_2')], () =>
    complete(a, 'monthly', {}, {}, 1, '2096-02-28', monthly),
  )
  await yes(complete(b, 'monthly', {}, {}, 1, '2096-02-29', monthly))
  const feb = {
    ...monthly,
    nextDueDate: '2096-02-29',
    assigneeIds: ['clean-b'],
  }
  await yes(
    complete(
      a,
      'monthly',
      { assigneeIds: ['clean-a'] },
      { assigneeIds: ['clean-b'] },
      2,
      '2096-03-31',
      feb,
    ),
  )
  await yes(
    undo(
      b,
      'monthly',
      { nextDueDate: '2096-02-29', assigneeIds: ['clean-b'] },
      3,
      3,
    ),
  )
  // Missing metadata / old-client writes cannot erase or bypass rotation.
  await yes(setDoc(doc(a, p('protect')), { ...base, ...meta }))
  await unchanged([p('protect')], () =>
    setDoc(doc(a, p('protect')), {
      ...base,
      lastAction: 'edit',
      ...audit('clean-a', 2),
    }),
  )
  await unchanged([p('protect'), h('protect_2')], () => {
    const batch = writeBatch(a)
    batch.update(doc(a, p('protect')), {
      nextDueDate: '2096-01-02',
      lastAction: 'complete',
      lastCompletionId: 'protect_2',
      ...audit('clean-a', 2),
    })
    batch.set(doc(a, h('protect_2')), {
      scheduleId: 'protect',
      scheduleVersion: 2,
      title: base.title,
      assigneeIds: base.assigneeIds,
      priority: base.priority,
      frequency: base.frequency,
      startDate: base.startDate,
      scheduledDate: base.nextDueDate,
      nextDueDate: '2096-01-02',
      completedAt: serverTimestamp(),
      completedBy: 'clean-a',
      cancelledAt: null,
      cancelledBy: null,
    })
    return batch.commit()
  })
  await unchanged([p('protect')], () =>
    updateDoc(doc(a, p('protect')), {
      assigneeIds: ['clean-b'],
      lastAction: 'complete',
      lastCompletionId: 'protect_2',
      nextDueDate: '2096-01-02',
      ...audit('clean-a', 2),
    }),
  )
  await unchanged([h('protect_2')], () =>
    setDoc(doc(a, h('protect_2')), {
      ...meta,
      scheduleId: 'protect',
      scheduleVersion: 2,
      completedAt: serverTimestamp(),
      completedBy: 'clean-a',
    }),
  )
  await no(getDocs(collection(a, root + 'recurringTasks')))
  await no(getDocs(collection(a, root + 'recurringCompletions')))
  await yes(
    setDoc(doc(other, 'households/clean-other/recurringTasks/fixed'), {
      ...base,
      createdBy: 'clean-other',
      updatedBy: 'clean-other',
      assigneeIds: ['clean-other'],
      ...meta,
      rotation: 'fixed',
    }),
  )
  await no(
    setDoc(doc(other, 'households/clean-other/recurringTasks/alternate'), {
      ...base,
      createdBy: 'clean-other',
      updatedBy: 'clean-other',
      assigneeIds: ['clean-other'],
      ...meta,
    }),
  )
  await yes(setDoc(doc(a, p('fixed')), { ...base, ...meta, rotation: 'fixed' }))
  await unchanged([p('fixed'), h('fixed_2')], () =>
    complete(a, 'fixed', {}, { rotation: 'fixed' }),
  )
  await yes(
    complete(a, 'fixed', { assigneeIds: ['clean-a'] }, { rotation: 'fixed' }),
  )
  // Simultaneous complete/edit/undo must leave exactly one coherent winner.
  for (const race of ['complete', 'edit', 'undo']) {
    const id = 'race-' + race
    await yes(setDoc(doc(a, p(id)), { ...base, ...meta }))
    let x, y
    if (race === 'undo') {
      await yes(complete(a, id))
      x = complete(
        a,
        id,
        { assigneeIds: ['clean-a'] },
        { assigneeIds: ['clean-b'] },
        2,
        '2096-01-03',
        { ...base, nextDueDate: '2096-01-02', assigneeIds: ['clean-b'] },
      )
      y = undo(b, id)
    } else {
      x = complete(a, id)
      y =
        race === 'complete'
          ? complete(b, id)
          : updateDoc(doc(b, p(id)), {
              title: '変更',
              lastAction: 'edit',
              lastCompletionId: null,
              ...audit('clean-b', 2),
            })
    }
    const result = await Promise.allSettled([x, y])
    assert.equal(result.filter((x) => x.status === 'fulfilled').length, 1)
    assert.equal(
      result.find((x) => x.status === 'rejected').reason.code,
      'permission-denied',
    )
    const state = await inspect([p(id), h(`${id}_2`), h(`${id}_3`)]),
      r = state[p(id)]
    assert.equal(r.version, race === 'undo' ? 3 : 2)
    if (r.lastAction === 'complete') {
      assert.equal(state[h(r.lastCompletionId)].cancelledAt, null)
      assert.equal(state[h(r.lastCompletionId)].nextDueDate, r.nextDueDate)
      assert.notDeepEqual(
        r.assigneeIds,
        state[h(r.lastCompletionId)].assigneeIds,
      )
    }
    if (r.lastAction === 'edit') assert.equal(state[h(`${id}_2`)], null)
    if (r.lastAction === 'undo') {
      assert.deepEqual(r.assigneeIds, ['clean-a'])
      assert.equal(r.nextDueDate, base.nextDueDate)
      assert.ok(state[h(`${id}_2`)].cancelledAt)
      assert.equal(state[h(`${id}_3`)], null)
    }
  }
  console.log(
    `PASS: cleaning Rules ${allows} allowed / ${denies} denied; schema/legacy/rotation/snapshot/undo/isolation/invariance/concurrent completion-edit-undo`,
  )
} finally {
  await env.cleanup()
}
