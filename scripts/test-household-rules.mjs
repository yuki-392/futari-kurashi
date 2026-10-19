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
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  runTransaction,
} from 'firebase/firestore'
const projectId = 'demo-futari-kurashi'
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: await readFile('firestore.rules', 'utf8'),
  },
})
const code = 'a'.repeat(32),
  otherCode = 'b'.repeat(32)
const db = (uid, email = `${uid}@example.test`, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore()
const owner = db('owner'),
  partner = db('partner'),
  third = db('third')
const house = (id = 'owner', members = ['owner'], active = null) => ({
  name: 'ふたりの暮らし',
  ownerId: id,
  memberIds: members,
  activeInviteId: active,
  createdAt: serverTimestamp(),
})
async function create(database, uid, id = 'home', extra = {}) {
  const batch = writeBatch(database)
  batch.set(doc(database, 'users', uid), {
    householdId: id,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(database, 'households', id), { ...house(uid, [uid]), ...extra })
  return batch.commit()
}
async function issue(
  database = owner,
  id = code,
  email = 'partner@example.test',
) {
  const batch = writeBatch(database)
  batch.set(doc(database, 'householdInvites', id), {
    householdId: 'home',
    householdName: 'ふたりの暮らし',
    createdBy: 'owner',
    targetEmail: email,
    createdAt: serverTimestamp(),
    usedBy: null,
    usedAt: null,
  })
  batch.update(doc(database, 'households', 'home'), { activeInviteId: id })
  return batch.commit()
}
async function join(database = partner, uid = 'partner', id = code) {
  return runTransaction(database, async (tx) => {
    await tx.get(doc(database, 'users', uid))
    const invite = await tx.get(doc(database, 'householdInvites', id))
    if (!invite.exists()) throw new Error('invalid invitation')
    tx.set(doc(database, 'users', uid), {
      householdId: 'home',
      createdAt: serverTimestamp(),
    })
    tx.update(doc(database, 'households', 'home'), {
      memberIds: arrayUnion(uid),
      activeInviteId: null,
    })
    tx.update(doc(database, 'householdInvites', id), {
      usedBy: uid,
      usedAt: serverTimestamp(),
    })
  })
}
async function seed(change = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore()
    await updateDoc(doc(database, 'householdInvites', code), change)
  })
}
async function test(name, fn) {
  await env.clearFirestore()
  await fn()
  console.log(`PASS: ${name}`)
}
try {
  await test('verified user creates exactly one household atomically', async () => {
    await assertSucceeds(create(owner, 'owner'))
    await assertSucceeds(getDoc(doc(owner, 'households', 'home')))
    await assertFails(create(owner, 'owner', 'another'))
    await assertFails(
      setDoc(
        doc(partner, 'households', 'orphan'),
        house('partner', ['partner']),
      ),
    )
  })
  await test('name boundaries and unknown fields are enforced in rules', async () => {
    for (const name of ['', '  ', ' 家', '家 ', '家'.repeat(41)]) {
      await assertFails(create(owner, 'owner', 'home', { name }))
    }
    await assertFails(create(owner, 'owner', 'home', { extraField: true }))
    await assertSucceeds(
      create(owner, 'owner', 'home', { name: '家'.repeat(40) }),
    )
  })
  await test('unauthenticated and unverified users cannot read or write', async () => {
    for (const database of [
      env.unauthenticatedContext().firestore(),
      db('owner', 'owner@example.test', false),
    ]) {
      await assertFails(create(database, 'owner'))
      await assertFails(getDoc(doc(database, 'users', 'owner')))
    }
  })
  await test('recipient previews invitation but cannot read household or lists', async () => {
    await create(owner, 'owner')
    await issue()
    await assertSucceeds(getDoc(doc(partner, 'householdInvites', code)))
    await assertFails(getDoc(doc(partner, 'households', 'home')))
    await assertFails(getDoc(doc(third, 'householdInvites', code)))
    for (const path of ['users', 'households', 'householdInvites'])
      await assertFails(getDocs(collection(owner, path)))
  })
  await test('join consumes invitation and grants membership together', async () => {
    await create(owner, 'owner')
    await issue()
    await assertSucceeds(join())
    await assertSucceeds(getDoc(doc(partner, 'households', 'home')))
    await assertFails(getDoc(doc(third, 'households', 'home')))
    await assertFails(join(third, 'third'))
    await assertFails(issue(owner, otherCode))
    await assertFails(create(partner, 'partner', 'another'))
  })
  await test('expired invitation rejects and just-inside boundary accepts', async () => {
    await create(owner, 'owner')
    await issue()
    await seed({ createdAt: Timestamp.fromMillis(Date.now() - 86400000) })
    await assertFails(join())
    await seed({
      createdAt: Timestamp.fromMillis(Date.now() - 86400000 + 60000),
    })
    await assertSucceeds(join())
  })
  await test('rotation and cancellation invalidate old codes', async () => {
    await create(owner, 'owner')
    await issue()
    await issue(owner, otherCode)
    await assertFails(getDoc(doc(partner, 'householdInvites', code)))
    await assertFails(join())
    await assertSucceeds(
      updateDoc(doc(owner, 'households', 'home'), { activeInviteId: null }),
    )
    await assertFails(join(partner, 'partner', otherCode))
  })
  await test('wrong email and reused invitation reject', async () => {
    await create(owner, 'owner')
    await issue()
    await assertFails(join(db('partner', 'wrong@example.test'), 'partner'))
    await assertSucceeds(join())
    await assertFails(join())
  })
  await test('direct tampering and partial operations reject', async () => {
    await create(owner, 'owner')
    await issue()
    await assertFails(
      updateDoc(doc(owner, 'households', 'home'), {
        memberIds: ['owner', 'third'],
      }),
    )
    await assertFails(
      updateDoc(doc(partner, 'households', 'home'), {
        memberIds: ['owner', 'partner'],
        activeInviteId: null,
      }),
    )
    await assertFails(
      setDoc(doc(partner, 'users', 'partner'), {
        householdId: 'home',
        createdAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(partner, 'householdInvites', code), {
        usedBy: 'partner',
        usedAt: serverTimestamp(),
      }),
    )
    await assertFails(
      updateDoc(doc(owner, 'householdInvites', code), {
        targetEmail: 'third@example.test',
      }),
    )
    await assertFails(
      updateDoc(doc(owner, 'households', 'home'), { name: '改ざん' }),
    )
    await assertFails(deleteDoc(doc(owner, 'households', 'home')))
    await assertFails(
      setDoc(doc(owner, 'households/home/tasks/test'), {
        title: 'not supported',
      }),
    )
    await assertFails(getDoc(doc(partner, 'users', 'owner')))
  })
  await test('forged invitations and post-preview invalidation reject', async () => {
    await create(owner, 'owner')
    await assertFails(issue(owner, code, 'owner@example.test'))
    await assertFails(issue(owner, code, 'Partner@Example.test'))
    await assertFails(issue(owner, code, 'invalid'))
    await issue()
    await assertSucceeds(getDoc(doc(partner, 'householdInvites', code)))
    await assertSucceeds(
      updateDoc(doc(owner, 'households', 'home'), { activeInviteId: null }),
    )
    await assertFails(join())
    await assertFails(deleteDoc(doc(owner, 'users', 'owner')))
    await assertFails(
      updateDoc(doc(owner, 'users', 'owner'), { householdId: 'other' }),
    )
  })
  await test('email case normalization is accepted', async () => {
    await create(owner, 'owner')
    await issue()
    await assertSucceeds(join(db('partner', 'Partner@Example.Test'), 'partner'))
  })
  await test('concurrent creates commit only one membership', async () => {
    const results = await Promise.allSettled([
      create(owner, 'owner', 'one'),
      create(owner, 'owner', 'two'),
    ])
    if (results.filter((r) => r.status === 'fulfilled').length !== 1)
      throw new Error('duplicate membership')
  })
  await test('concurrent invite consumers commit only one member', async () => {
    await create(owner, 'owner')
    await issue()
    const results = await Promise.allSettled([
      join(),
      join(db('second', 'partner@example.test'), 'second'),
    ])
    if (results.filter((r) => r.status === 'fulfilled').length !== 1)
      throw new Error('duplicate consumption')
    const snapshot = await getDoc(doc(owner, 'households', 'home'))
    if (snapshot.data().memberIds.length !== 2)
      throw new Error('invalid member count')
  })
} finally {
  await env.cleanup()
}
