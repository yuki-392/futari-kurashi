import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc,
  collection,
  collectionGroup,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
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
const a = ctx('decl-a'),
  b = ctx('decl-b'),
  outsider = ctx('decl-other'),
  none = ctx('decl-none'),
  unverified = ctx('decl-a', false),
  guest = env.unauthenticatedContext().firestore()
const path = (id) => 'households/decl-home/declutterItems/' + id
const data = (patch = {}) => ({
  title: '古い服',
  method: 'hold',
  ownerIds: ['decl-a'],
  dueDate: '2026-10-20',
  sortDueDate: '2026-10-20',
  completed: false,
  completedAt: null,
  completedBy: null,
  version: 1,
  createdAt: serverTimestamp(),
  createdBy: 'decl-a',
  updatedAt: serverTimestamp(),
  updatedBy: 'decl-a',
  ...patch,
})
const change = (uid, patch = {}) => ({
  version: 2,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
  ...patch,
})
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
async function inspect(paths) {
  const out = {}
  await env.withSecurityRulesDisabled(async (c) => {
    for (const p of paths) {
      const s = await getDoc(doc(c.firestore(), p))
      out[p] = s.exists() ? s.data() : null
    }
  })
  return out
}
async function unchanged(paths, operation) {
  const old = await inspect(paths)
  await no(operation())
  assert.deepEqual(await inspect(paths), old)
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore()
    await setDoc(doc(db, 'households/decl-home'), {
      memberIds: ['decl-a', 'decl-b'],
      ownerId: 'decl-a',
    })
    for (const uid of ['decl-a', 'decl-b'])
      await setDoc(doc(db, 'users', uid), { householdId: 'decl-home' })
    await setDoc(doc(db, 'households/decl-other'), {
      memberIds: ['decl-other'],
    })
    await setDoc(doc(db, 'users/decl-other'), { householdId: 'decl-other' })
  })
  await yes(setDoc(doc(a, path('valid')), data()))
  await yes(getDoc(doc(b, path('valid'))))
  for (const completed of [false, true])
    for (const method of ['', 'hold'])
      await yes(
        getDocs(
          query(
            collection(b, 'households/decl-home/declutterItems'),
            where('completed', '==', completed),
            ...(method ? [where('method', '==', method)] : []),
            ...(completed
              ? [orderBy('completedAt', 'desc')]
              : [orderBy('sortDueDate', 'asc'), orderBy('createdAt', 'desc')]),
            limit(101),
          ),
        ),
      )
  for (const db of [outsider, none, unverified, guest]) {
    await unchanged([path('valid')], () => getDoc(doc(db, path('valid'))))
    await no(
      getDocs(
        query(collection(db, 'households/decl-home/declutterItems'), limit(5)),
      ),
    )
    await unchanged([path('intrude')], () =>
      setDoc(doc(db, path('intrude')), data()),
    )
    await unchanged([path('valid')], () =>
      updateDoc(doc(db, path('valid')), change('decl-a', { title: '変更' })),
    )
    await unchanged([path('valid')], () => deleteDoc(doc(db, path('valid'))))
  }
  await no(getDocs(collection(a, 'households/decl-home/declutterItems')))
  await no(getDocs(query(collectionGroup(a, 'declutterItems'), limit(10))))
  await yes(
    getDocs(
      query(
        collection(a, 'households/decl-home/declutterItems'),
        where('completed', '==', false),
        where('sortDueDate', '<=', '2026-10-20'),
        orderBy('sortDueDate'),
        orderBy('createdAt', 'desc'),
        limit(6),
      ),
    ),
  )
  let i = 0
  for (const patch of [
    { title: '' },
    { title: ' x ' },
    { title: 'x'.repeat(101) },
    { title: 1 },
    { method: 'unknown' },
    { method: 1 },
    { method: null },
    { ownerIds: ['decl-other'] },
    { ownerIds: ['decl-a', 'decl-a'] },
    { ownerIds: ['decl-a', 'decl-b', 'decl-other'] },
    { ownerIds: 'decl-a' },
    { dueDate: '2025-02-29', sortDueDate: '2025-02-29' },
    { dueDate: '2026-04-31', sortDueDate: '2026-04-31' },
    { dueDate: '2026-13-01', sortDueDate: '2026-13-01' },
    { dueDate: '0999-12-31', sortDueDate: '0999-12-31' },
    { dueDate: '2026-1-1', sortDueDate: '2026-1-1' },
    { dueDate: 1 },
    { dueDate: '' },
    { dueDate: null },
    { sortDueDate: '~' },
    { sortDueDate: null },
    { completed: true },
    { completed: 1 },
    { completedAt: Timestamp.fromMillis(0) },
    { completedBy: 'decl-b' },
    { version: 2 },
    { version: 1.5 },
    { createdAt: Timestamp.fromMillis(0) },
    { createdBy: 'decl-b' },
    { updatedAt: Timestamp.fromMillis(0) },
    { updatedBy: 'decl-b' },
    { extra: true },
  ]) {
    const p = path('bad' + i++)
    await unchanged([p], () => setDoc(doc(a, p), data(patch)))
  }
  for (const key of Object.keys(data())) {
    const value = data()
    delete value[key]
    await unchanged([path('missing')], () =>
      setDoc(doc(a, path('missing')), value),
    )
  }
  for (const [date, owners] of [
    [null, []],
    ['2024-02-29', ['decl-a', 'decl-b']],
    ['1000-01-01', ['decl-b']],
    ['9999-12-31', ['decl-a']],
  ]) {
    await yes(
      setDoc(
        doc(a, path('edge' + i++)),
        data({
          dueDate: date,
          sortDueDate: date ?? '~',
          ownerIds: owners,
          title: '😀'.repeat(100),
        }),
      ),
    )
  }
  // Hold requires an explicit method decision, completion audits cannot be supplied separately.
  await unchanged([path('valid')], () =>
    updateDoc(
      doc(b, path('valid')),
      change('decl-b', {
        completed: true,
        completedAt: serverTimestamp(),
        completedBy: 'decl-b',
      }),
    ),
  )
  await yes(
    updateDoc(
      doc(b, path('valid')),
      change('decl-b', {
        method: 'sell',
        completed: true,
        completedAt: serverTimestamp(),
        completedBy: 'decl-b',
      }),
    ),
  )
  const saved = (await inspect([path('valid')]))[path('valid')]
  assert.equal(saved.completedBy, 'decl-b')
  assert.equal(saved.completed, true)
  assert.equal(saved.createdBy, 'decl-a')
  for (const patch of [
    { createdBy: 'decl-b' },
    { createdAt: serverTimestamp() },
    { version: 2 },
    { version: 4 },
    { updatedBy: 'decl-a' },
    { updatedAt: Timestamp.fromMillis(0) },
    { ownerIds: ['decl-other'] },
    { extra: true },
    { method: 'hold' },
    { completedBy: 'decl-a' },
    { completedAt: Timestamp.fromMillis(0) },
    { completedAt: null },
    { completedBy: null },
    { completed: false },
    { dueDate: null },
    { sortDueDate: '~' },
  ])
    await unchanged([path('valid')], () =>
      updateDoc(doc(b, path('valid')), {
        ...change('decl-b', { version: 3 }),
        ...patch,
      }),
    )
  await yes(
    updateDoc(
      doc(a, path('valid')),
      change('decl-a', {
        version: 3,
        title: '編集',
        method: 'give',
        dueDate: null,
        sortDueDate: '~',
      }),
    ),
  )
  const edited = (await inspect([path('valid')]))[path('valid')]
  assert.deepEqual(edited.completedAt, saved.completedAt)
  assert.equal(edited.completedBy, saved.completedBy)
  await yes(
    updateDoc(
      doc(a, path('valid')),
      change('decl-a', {
        version: 4,
        completed: false,
        completedAt: null,
        completedBy: null,
        method: 'hold',
      }),
    ),
  )
  const undone = (await inspect([path('valid')]))[path('valid')]
  assert.equal(undone.completedAt, null)
  assert.equal(undone.completedBy, null)
  for (const patch of [
    { completed: true, method: 'sell' },
    {
      completed: true,
      method: 'sell',
      completedAt: serverTimestamp(),
      completedBy: 'decl-b',
    },
    {
      completed: true,
      method: 'sell',
      completedAt: Timestamp.fromMillis(0),
      completedBy: 'decl-a',
    },
    { completedBy: 'decl-a' },
    { completedAt: serverTimestamp() },
  ])
    await unchanged([path('valid')], () =>
      updateDoc(
        doc(a, path('valid')),
        change('decl-a', { version: 5, ...patch }),
      ),
    )
  await yes(
    updateDoc(
      doc(a, path('valid')),
      change('decl-a', {
        version: 5,
        completed: true,
        method: 'discard',
        completedAt: serverTimestamp(),
        completedBy: 'decl-a',
      }),
    ),
  )
  const redone = (await inspect([path('valid')]))[path('valid')]
  assert.equal(redone.completedBy, 'decl-a')
  assert.ok(redone.completedAt.toMillis() > saved.completedAt.toMillis())
  await yes(deleteDoc(doc(b, path('valid'))))
  assert.equal((await inspect([path('valid')]))[path('valid')], null)
  for (const race of ['purchase', 'edit']) {
    const p = path('race-' + race)
    await yes(setDoc(doc(a, p), data({ method: 'sell' })))
    const result = await Promise.allSettled([
      updateDoc(
        doc(a, p),
        change('decl-a', {
          completed: true,
          completedAt: serverTimestamp(),
          completedBy: 'decl-a',
        }),
      ),
      updateDoc(
        doc(b, p),
        change(
          'decl-b',
          race === 'edit'
            ? { title: '変更' }
            : {
                completed: true,
                completedAt: serverTimestamp(),
                completedBy: 'decl-b',
              },
        ),
      ),
    ])
    assert.equal(result.filter((x) => x.status === 'fulfilled').length, 1)
    assert.equal(
      result.find((x) => x.status === 'rejected').reason.code,
      'permission-denied',
    )
    const value = (await inspect([p]))[p]
    assert.equal(value.version, 2)
    assert.ok(value.completed || value.title === '変更')
    assert.equal(value.createdBy, 'decl-a')
    assert.equal(value.completedBy, value.completed ? value.updatedBy : null)
    assert.equal(value.completedAt === null, !value.completed)
  }
  console.log(
    `PASS: declutter Rules ${allows} allowed / ${denies} denied; isolation, finite queries, real dates/sort/owners/methods, schemas/audit, immutable rejection, complete/edit races, deletion`,
  )
} finally {
  await env.cleanup()
}
