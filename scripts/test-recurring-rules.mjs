import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  getDocs,
  collection,
  collectionGroup,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
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
const ctx = (uid, verified = true) =>
  env
    .authenticatedContext(uid, {
      email: `${uid}@example.test`,
      email_verified: verified,
    })
    .firestore()
const a = ctx('rec-a'),
  b = ctx('rec-b'),
  other = ctx('rec-other'),
  none = ctx('rec-none'),
  unverified = ctx('rec-a', false),
  guest = env.unauthenticatedContext().firestore()
const root = 'households/rec-home/',
  p = (id) => root + 'recurringTasks/' + id,
  h = (id) => root + 'recurringCompletions/' + id
let year = Math.ceil((new Date().getUTCFullYear() + 1) / 4) * 4
while (year % 100 === 0 && year % 400 !== 0) year += 4
const start = `${year}-01-31`,
  following = `${year}-02-29`
const input = {
  title: '毎月の掃除',
  assigneeIds: ['rec-a', 'rec-b'],
  priority: 'medium',
  frequency: 'monthly',
  startDate: start,
  nextDueDate: start,
}
const data = (patch = {}) => ({
  ...input,
  active: true,
  version: 1,
  lastCompletionId: null,
  lastAction: 'create',
  createdAt: serverTimestamp(),
  createdBy: 'rec-a',
  updatedAt: serverTimestamp(),
  updatedBy: 'rec-a',
  ...patch,
})
let allows = 0,
  denies = 0
async function yes(promise) {
  try {
    await assertSucceeds(promise)
    allows++
  } catch (error) {
    throw new Error(`allow ${allows + 1}`, { cause: error })
  }
}
async function no(promise) {
  const error = await assertFails(promise)
  assert.equal(error.code, 'permission-denied')
  denies++
}
async function inspect(paths) {
  const result = {}
  await env.withSecurityRulesDisabled(async (c) => {
    for (const path of paths) {
      const s = await getDoc(doc(c.firestore(), path))
      result[path] = s.exists() ? s.data() : null
    }
  })
  return result
}
function pair(
  db,
  id,
  version = 1,
  next = following,
  overrides = {},
  histOverrides = {},
) {
  const batch = writeBatch(db),
    hid = `${id}_${version + 1}`,
    actor = db === b ? 'rec-b' : 'rec-a'
  batch.update(doc(db, p(id)), {
    nextDueDate: next,
    lastCompletionId: hid,
    lastAction: 'complete',
    version: version + 1,
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    ...overrides,
  })
  batch.set(doc(db, h(hid)), {
    scheduleId: id,
    scheduleVersion: version + 1,
    ...input,
    scheduledDate: start,
    nextDueDate: next,
    completedAt: serverTimestamp(),
    completedBy: actor,
    cancelledAt: null,
    cancelledBy: null,
    ...histOverrides,
  })
  return batch.commit()
}
function cancel(db, id, version = 2, historyVersion = 2, patch = {}) {
  const batch = writeBatch(db),
    actor = db === b ? 'rec-b' : 'rec-a'
  batch.update(doc(db, p(id)), {
    version: version + 1,
    nextDueDate: start,
    lastCompletionId: null,
    lastAction: 'undo',
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    ...patch,
  })
  batch.update(doc(db, h(`${id}_${historyVersion}`)), {
    cancelledAt: serverTimestamp(),
    cancelledBy: actor,
  })
  return batch.commit()
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    await setDoc(doc(d, 'households/rec-home'), {
      name: '繰り返しテスト',
      ownerId: 'rec-a',
      memberIds: ['rec-a', 'rec-b'],
      activeInviteId: null,
      createdAt: Timestamp.now(),
    })
    for (const uid of ['rec-a', 'rec-b'])
      await setDoc(doc(d, 'users', uid), {
        householdId: 'rec-home',
        createdAt: Timestamp.now(),
      })
    await setDoc(doc(d, 'households/rec-other'), {
      memberIds: ['rec-other'],
      ownerId: 'rec-other',
    })
    await setDoc(doc(d, 'users/rec-other'), { householdId: 'rec-other' })
  })
  await yes(setDoc(doc(a, p('valid')), data()))
  await yes(getDoc(doc(b, p('valid'))))
  await yes(
    getDocs(
      query(
        collection(a, root + 'recurringTasks'),
        orderBy('nextDueDate'),
        limit(101),
      ),
    ),
  )
  await yes(
    getDocs(
      query(
        collection(a, root + 'recurringTasks'),
        where('active', '==', true),
        where('nextDueDate', '<=', start),
        orderBy('nextDueDate'),
        limit(11),
      ),
    ),
  )
  for (const d of [other, none, unverified, guest]) {
    await no(getDoc(doc(d, p('valid'))))
    await no(getDocs(query(collection(d, root + 'recurringTasks'), limit(10))))
    await no(setDoc(doc(d, p('intrude')), data()))
    await no(
      updateDoc(doc(d, p('valid')), {
        active: false,
        version: 2,
        lastCompletionId: null,
        lastAction: 'pause',
        updatedAt: serverTimestamp(),
        updatedBy: 'rec-a',
      }),
    )
    await no(deleteDoc(doc(d, p('valid'))))
    await no(getDoc(doc(d, h('valid_2'))))
    await no(
      getDocs(query(collection(d, root + 'recurringCompletions'), limit(10))),
    )
  }
  await no(getDocs(collection(a, root + 'recurringTasks')))
  await no(getDocs(collection(a, root + 'recurringCompletions')))
  await no(getDocs(query(collectionGroup(a, 'recurringTasks'), limit(10))))
  for (const [i, patch] of [
    { title: '' },
    { title: ' 前後 ' },
    { title: 'あ'.repeat(101) },
    { assigneeIds: ['rec-other'] },
    { assigneeIds: ['rec-a', 'rec-a'] },
    { priority: 'bad' },
    { frequency: 'yearly' },
    { startDate: `${year}-02-30` },
    { nextDueDate: `${year}-01-30` },
    { nextDueDate: `${year}-02-28` },
    { active: 'true' },
    { version: 2 },
    { lastCompletionId: 'fake' },
    { createdBy: 'rec-b' },
    { updatedBy: 'rec-b' },
    { createdAt: Timestamp.fromMillis(1) },
    { extra: true },
  ].entries())
    await no(setDoc(doc(a, p('bad-' + i)), data(patch)))
  for (const key of Object.keys(data())) {
    const d = data()
    delete d[key]
    await no(setDoc(doc(a, p('missing-' + key)), d))
  }
  await yes(
    setDoc(
      doc(a, p('emoji')),
      data({ title: '🏠'.repeat(100), assigneeIds: [] }),
    ),
  )
  const paths = [p('valid'), h('valid_2')],
    before = await inspect(paths)
  assert.equal(before[p('valid')].version, 1)
  await no(
    updateDoc(doc(a, p('valid')), {
      nextDueDate: following,
      lastCompletionId: 'valid_2',
      lastAction: 'complete',
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'rec-a',
    }),
  )
  for (const [next, patch, histPatch] of [
    [`${year}-03-31`, {}, {}],
    [following, {}, { title: '偽履歴' }],
    [following, {}, { completedBy: 'rec-b' }],
    [following, {}, { completedAt: Timestamp.fromMillis(1) }],
    [following, { version: 3 }, {}],
    [following, {}, { scheduledDate: following }],
  ]) {
    await no(pair(a, 'valid', 1, next, patch, histPatch))
    assert.deepEqual(await inspect(paths), before)
  }
  const solo = writeBatch(a)
  solo.set(doc(a, h('valid_2')), {
    ...input,
    scheduleId: 'valid',
    scheduleVersion: 2,
    scheduledDate: start,
    nextDueDate: following,
    completedAt: serverTimestamp(),
    completedBy: 'rec-a',
    cancelledAt: null,
    cancelledBy: null,
  })
  await no(solo.commit())
  await yes(pair(a, 'valid'))
  const done = await inspect(paths)
  assert.equal(done[p('valid')].version, 2)
  assert.equal(done[h('valid_2')].completedBy, 'rec-a')
  await yes(
    getDocs(
      query(
        collection(b, root + 'recurringCompletions'),
        orderBy('completedAt', 'desc'),
        limit(101),
      ),
    ),
  )
  await no(pair(b, 'valid'))
  await no(updateDoc(doc(a, h('valid_2')), { title: '書換' }))
  await no(deleteDoc(doc(a, h('valid_2'))))
  await no(deleteDoc(doc(a, p('valid'))))
  await no(
    updateDoc(doc(b, h('valid_2')), {
      cancelledAt: serverTimestamp(),
      cancelledBy: 'rec-b',
    }),
  )
  await no(
    updateDoc(doc(b, p('valid')), {
      nextDueDate: start,
      version: 3,
      lastCompletionId: null,
      lastAction: 'undo',
      updatedAt: serverTimestamp(),
      updatedBy: 'rec-b',
    }),
  )
  assert.deepEqual(await inspect(paths), done)
  await yes(cancel(b, 'valid'))
  const undone = await inspect(paths)
  assert.equal(undone[p('valid')].nextDueDate, start)
  assert.equal(undone[p('valid')].lastCompletionId, null)
  assert.equal(undone[h('valid_2')].cancelledBy, 'rec-b')
  await no(cancel(a, 'valid', 3))
  assert.deepEqual(await inspect(paths), undone)
  await yes(pair(b, 'valid', 3))
  assert.equal(
    (await inspect([h('valid_4')]))[h('valid_4')].completedBy,
    'rec-b',
  )
  await no(cancel(a, 'valid', 4, 2))
  await yes(
    updateDoc(doc(a, p('valid')), {
      active: false,
      lastCompletionId: null,
      lastAction: 'pause',
      version: 5,
      updatedAt: serverTimestamp(),
      updatedBy: 'rec-a',
    }),
  )
  await no(cancel(b, 'valid', 5, 4))
  await no(
    pair(a, 'valid', 5, `${year}-03-31`, {}, { scheduledDate: following }),
  )
  await yes(
    updateDoc(doc(b, p('valid')), {
      active: true,
      lastCompletionId: null,
      lastAction: 'resume',
      version: 6,
      updatedAt: serverTimestamp(),
      updatedBy: 'rec-b',
    }),
  )
  await yes(
    updateDoc(doc(b, p('valid')), {
      lastAction: 'edit',
      title: '設定編集',
      startDate: `${year}-03-15`,
      nextDueDate: `${year}-03-15`,
      lastCompletionId: null,
      version: 7,
      updatedAt: serverTimestamp(),
      updatedBy: 'rec-b',
    }),
  )
  // 日・週の未来の早期完了、長期持ち越し、世紀のうるう年もRulesで検証。
  const iso = (value) => value.toISOString().slice(0, 10)
  const add = (value, days) =>
    iso(new Date(new Date(value + 'T00:00:00Z').getTime() + days * 86400000))
  const currentDay = iso(new Date(Date.now() + 9 * 3600000))
  for (const [id, frequency, anchor, due, next] of [
    [
      'daily-future',
      'daily',
      `${year}-01-01`,
      `${year}-01-01`,
      `${year}-01-02`,
    ],
    [
      'weekly-future',
      'weekly',
      `${year}-01-01`,
      `${year}-01-01`,
      `${year}-01-08`,
    ],
    ['daily-late', 'daily', '2020-01-01', '2020-01-01', add(currentDay, 1)],
    [
      'weekly-late',
      'weekly',
      '2020-01-06',
      '2020-01-06',
      add(
        currentDay,
        (1 - new Date(currentDay + 'T00:00:00Z').getUTCDay() + 7) % 7 || 7,
      ),
    ],
    [
      'year-roll',
      'monthly',
      `${year}-12-31`,
      `${year}-12-31`,
      `${year + 1}-01-31`,
    ],
    ['century', 'monthly', '2100-01-31', '2100-01-31', '2100-02-28'],
    ['quad-century', 'monthly', '2400-01-31', '2400-01-31', '2400-02-29'],
  ]) {
    await yes(
      setDoc(
        doc(a, p(id)),
        data({ frequency, startDate: anchor, nextDueDate: due }),
      ),
    )
    await no(
      pair(
        a,
        id,
        1,
        add(next, 1),
        {},
        { frequency, startDate: anchor, scheduledDate: due },
      ),
    )
    await yes(
      pair(
        a,
        id,
        1,
        next,
        {},
        { frequency, startDate: anchor, scheduledDate: due },
      ),
    )
    const value = await inspect([p(id), h(id + '_2')])
    assert.equal(value[p(id)].nextDueDate, next)
    assert.equal(value[h(id + '_2')].scheduledDate, due)
  }
  // 同時完了は一方だけが勝ち、履歴も1件。
  await yes(setDoc(doc(a, p('race')), data()))
  let results = await Promise.allSettled([pair(a, 'race'), pair(b, 'race')])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.code,
    'permission-denied',
  )
  let saved = await inspect([p('race'), h('race_2')])
  assert.equal(saved[p('race')].version, 2)
  assert(saved[h('race_2')])
  allows++
  denies++
  // 次回完了と取消が同じ版から競合しても一方だけ成功。
  results = await Promise.allSettled([
    pair(a, 'race', 2, `${year}-03-31`, {}, { scheduledDate: following }),
    cancel(b, 'race'),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.code,
    'permission-denied',
  )
  saved = await inspect([p('race'), h('race_2'), h('race_3')])
  assert.equal(saved[p('race')].version, 3)
  if (saved[p('race')].lastCompletionId === null) {
    assert(saved[h('race_2')].cancelledAt)
    assert.equal(saved[h('race_3')], null)
  } else {
    assert.equal(saved[p('race')].nextDueDate, `${year}-03-31`)
    assert(saved[h('race_3')])
    assert.equal(saved[h('race_2')].cancelledAt, null)
  }
  allows++
  denies++
  // 完了と設定変更の競合も成功1件で履歴の有無と保存内容が一致。
  await yes(setDoc(doc(a, p('edit-race')), data()))
  results = await Promise.allSettled([
    pair(a, 'edit-race'),
    updateDoc(doc(b, p('edit-race')), {
      title: '編集の勝者',
      lastCompletionId: null,
      lastAction: 'edit',
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'rec-b',
    }),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.code,
    'permission-denied',
  )
  saved = await inspect([p('edit-race'), h('edit-race_2')])
  assert.equal(saved[p('edit-race')].version, 2)
  assert.equal(
    !!saved[h('edit-race_2')],
    saved[p('edit-race')].lastCompletionId !== null,
  )
  allows++
  denies++
  console.log(
    `PASS: recurring rules ${allows} allow / ${denies} deny; isolation, schema, calendar, atomic complete/undo, audit immutability, competing operations and stored consistency`,
  )
} finally {
  await env.cleanup()
}
