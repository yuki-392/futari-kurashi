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
const a = ctx('shop-a'),
  b = ctx('shop-b'),
  outsider = ctx('shop-other'),
  none = ctx('shop-none'),
  unverified = ctx('shop-a', false),
  guest = env.unauthenticatedContext().firestore()
const path = (id) => 'households/shop-home/shoppingItems/' + id
const data = (patch = {}) => ({
  title: '牛乳',
  category: 'food',
  quantity: '2',
  unit: '本',
  budget: 500,
  assigneeIds: ['shop-a'],
  priority: 3,
  purchased: false,
  version: 1,
  createdAt: serverTimestamp(),
  createdBy: 'shop-a',
  updatedAt: serverTimestamp(),
  updatedBy: 'shop-a',
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
    await setDoc(doc(db, 'households/shop-home'), {
      memberIds: ['shop-a', 'shop-b'],
      ownerId: 'shop-a',
    })
    for (const uid of ['shop-a', 'shop-b'])
      await setDoc(doc(db, 'users', uid), { householdId: 'shop-home' })
    await setDoc(doc(db, 'households/shop-other'), {
      memberIds: ['shop-other'],
    })
    await setDoc(doc(db, 'users/shop-other'), { householdId: 'shop-other' })
  })
  await yes(setDoc(doc(a, path('valid')), data()))
  await yes(getDoc(doc(b, path('valid'))))
  for (const purchased of [false, true])
    for (const category of ['', 'food'])
      await yes(
        getDocs(
          query(
            collection(b, 'households/shop-home/shoppingItems'),
            where('purchased', '==', purchased),
            ...(category ? [where('category', '==', category)] : []),
            ...(purchased
              ? [orderBy('updatedAt', 'desc')]
              : [orderBy('priority', 'desc'), orderBy('createdAt', 'desc')]),
            limit(101),
          ),
        ),
      )
  for (const db of [outsider, none, unverified, guest]) {
    await unchanged([path('valid')], () => getDoc(doc(db, path('valid'))))
    await no(
      getDocs(
        query(collection(db, 'households/shop-home/shoppingItems'), limit(5)),
      ),
    )
    await unchanged([path('intrude')], () =>
      setDoc(doc(db, path('intrude')), data()),
    )
    await unchanged([path('valid')], () =>
      updateDoc(doc(db, path('valid')), change('shop-a', { title: '変更' })),
    )
    await unchanged([path('valid')], () => deleteDoc(doc(db, path('valid'))))
  }
  await no(getDocs(collection(a, 'households/shop-home/shoppingItems')))
  await no(getDocs(query(collectionGroup(a, 'shoppingItems'), limit(10))))
  let i = 0
  for (const patch of [
    { title: '' },
    { title: ' x ' },
    { title: 'x'.repeat(101) },
    { title: 1 },
    { unit: 'x'.repeat(11) },
    { unit: 1 },
    { unit: ' 本 ' },
    { category: 'unknown' },
    { category: 1 },
    { quantity: '0' },
    { quantity: '0.000' },
    { quantity: '1.0' },
    { quantity: '00.5' },
    { quantity: 1 },
    { quantity: '1000000' },
    { quantity: '1.0001' },
    { quantity: '1e2' },
    { quantity: '-1' },
    { quantity: [] },
    { quantity: null },
    { budget: -1 },
    { budget: 0.1 },
    { budget: 1e9 },
    { budget: '500' },
    { budget: NaN },
    { assigneeIds: ['shop-other'] },
    { assigneeIds: ['shop-a', 'shop-a'] },
    { assigneeIds: 'shop-a' },
    { priority: 0 },
    { priority: 4 },
    { priority: 1.5 },
    { priority: '3' },
    { purchased: true },
    { purchased: 1 },
    { version: 2 },
    { createdAt: Timestamp.fromMillis(0) },
    { createdBy: 'shop-b' },
    { updatedAt: Timestamp.fromMillis(0) },
    { updatedBy: 'shop-b' },
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
  for (const [quantity, budget, unit, ids] of [
    ['0.001', 0, '', []],
    ['999999.999', 999999999, 'x'.repeat(10), ['shop-a', 'shop-b']],
    ['1', null, '個', ['shop-b']],
  ])
    await yes(
      setDoc(
        doc(a, path('edge' + quantity)),
        data({
          quantity,
          budget,
          unit,
          assigneeIds: ids,
          title: 'x'.repeat(100),
        }),
      ),
    )
  await yes(
    updateDoc(
      doc(b, path('valid')),
      change('shop-b', { purchased: true, quantity: '0.5', budget: 0 }),
    ),
  )
  const saved = await inspect([path('valid')])
  assert.equal(saved[path('valid')].purchased, true)
  assert.equal(saved[path('valid')].budget, 0)
  assert.equal(saved[path('valid')].createdBy, 'shop-a')
  for (const patch of [
    { createdBy: 'shop-b' },
    { createdAt: serverTimestamp() },
    { version: 2 },
    { version: 4 },
    { updatedBy: 'shop-a' },
    { updatedAt: Timestamp.fromMillis(0) },
    { quantity: '2.00' },
    { assigneeIds: ['shop-other'] },
    { extra: true },
  ])
    await unchanged([path('valid')], () =>
      updateDoc(doc(b, path('valid')), {
        ...change('shop-b', { version: 3 }),
        ...patch,
      }),
    )
  await yes(
    updateDoc(
      doc(a, path('valid')),
      change('shop-a', { version: 3, purchased: false }),
    ),
  )
  await yes(deleteDoc(doc(b, path('valid'))))
  assert.equal((await inspect([path('valid')]))[path('valid')], null)
  for (const race of ['purchase', 'edit']) {
    const p = path('race-' + race)
    await yes(setDoc(doc(a, p), data()))
    const result = await Promise.allSettled([
      updateDoc(doc(a, p), change('shop-a', { purchased: true })),
      updateDoc(
        doc(b, p),
        change(
          'shop-b',
          race === 'edit' ? { title: '変更' } : { purchased: true },
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
    assert.ok(value.purchased || value.title === '変更')
    assert.equal(value.createdBy, 'shop-a')
  }
  console.log(
    `PASS: shopping Rules ${allows} allowed / ${denies} denied; isolation, finite queries, canonical decimals/budgets, schemas/audit, immutable rejection, purchase/edit races, deletion`,
  )
} finally {
  await env.cleanup()
}
