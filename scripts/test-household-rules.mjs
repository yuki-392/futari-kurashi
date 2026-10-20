import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
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
  writeBatch,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  runTransaction,
  query,
  where,
  setLogLevel,
} from 'firebase/firestore'
setLogLevel('silent')
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
  scenarioCount++
  await env.clearFirestore()
  await fn()
  console.log(`PASS: ${name}`)
}
const invitationA = 'c'.repeat(32),
  invitationB = 'd'.repeat(32),
  invitationP = 'e'.repeat(32),
  rotatedCode = 'f'.repeat(32)
const actor = (uid, email = `${uid}@example.test`, verified = true) => ({
  uid,
  email,
  database: db(uid, email, verified),
})
const principals = {
  owner: actor('alice'),
  member: actor('amy'),
  otherOwner: actor('bob'),
  otherMember: actor('ben'),
  guest: actor('guest'),
  inviter: actor('pat'),
  unverified: actor('alice', 'alice@example.test', false),
  anonymous: {
    uid: null,
    email: null,
    database: env.unauthenticatedContext().firestore(),
  },
}
const supportedCollections = ['users', 'households', 'householdInvites']
const unsupportedCollections = [
  'cleaningSchedules',
  'declutterItems',
  'expenses',
  'incomes',
  'budgets',
  'houseRules',
  'unknown',
]
const unsupportedPaths = unsupportedCollections
  .map((name) => `households/A/${name}/sample`)
  .concat('unknown/sample')
let deniedChecks = 0,
  allowedChecks = 0,
  scenarioCount = 0
async function snapshotWorld(extraPaths = []) {
  const result = {}
  await env.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore()
    for (const path of supportedCollections) {
      const docs = await getDocs(collection(database, path))
      for (const item of docs.docs) result[item.ref.path] = item.data()
    }
    for (const path of extraPaths) {
      const item = await getDoc(doc(database, path))
      result[path] = item.exists() ? item.data() : null
    }
  })
  assert(
    Object.keys(result).length > 0,
    'Snapshot must contain the persisted fixtures',
  )
  return result
}
async function deny(operation, label, extraPaths = []) {
  const before = await snapshotWorld(extraPaths)
  await assert.rejects(
    operation,
    (error) => error.code === 'permission-denied',
    label,
  )
  assert.deepEqual(
    await snapshotWorld(extraPaths),
    before,
    `${label}: rejected writes must be atomic`,
  )
  deniedChecks++
}
async function denyRead(operation, label) {
  await assert.rejects(
    operation,
    (error) => error.code === 'permission-denied',
    label,
  )
  deniedChecks++
}
async function allow(operation) {
  await assertSucceeds(operation())
  allowedChecks++
}
function invitation(homeId, ownerId, email, usedBy = null) {
  const time = Timestamp.fromMillis(Date.now() - 1000)
  return {
    householdId: homeId,
    householdName: `世帯${homeId}`,
    createdBy: ownerId,
    targetEmail: email,
    createdAt: time,
    usedBy,
    usedAt: usedBy ? time : null,
  }
}
async function fixtures() {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore(),
      batch = writeBatch(database)
    for (const [id, members, active] of [
      ['A', ['alice', 'amy'], null],
      ['B', ['bob', 'ben'], null],
      ['P', ['pat'], invitationP],
    ]) {
      batch.set(doc(database, 'households', id), {
        ...house(members[0], members, active),
        name: `世帯${id}`,
      })
      for (const uid of members)
        batch.set(doc(database, 'users', uid), {
          householdId: id,
          createdAt: serverTimestamp(),
        })
    }
    batch.set(
      doc(database, 'householdInvites', invitationA),
      invitation('A', 'alice', 'amy@example.test', 'amy'),
    )
    batch.set(
      doc(database, 'householdInvites', invitationB),
      invitation('B', 'bob', 'ben@example.test', 'ben'),
    )
    batch.set(
      doc(database, 'householdInvites', invitationP),
      invitation('P', 'pat', 'guest@example.test'),
    )
    for (const path of unsupportedPaths)
      batch.set(doc(database, path), { title: 'unsupported test fixture' })
    await batch.commit()
  })
}
function directCreate(principal, id, homePatch = {}, userPatch = {}) {
  const { database, uid } = principal,
    batch = writeBatch(database)
  batch.set(doc(database, 'households', id), {
    ...house(uid, [uid]),
    ...homePatch,
  })
  batch.set(doc(database, 'users', uid ?? 'fake'), {
    householdId: id,
    createdAt: serverTimestamp(),
    ...userPatch,
  })
  return batch.commit()
}
function directIssue(principal, id = rotatedCode, patch = {}, homeId = 'P') {
  const { database, uid } = principal,
    batch = writeBatch(database)
  batch.set(doc(database, 'householdInvites', id), {
    ...invitation(homeId, uid, 'guest@example.test'),
    createdAt: serverTimestamp(),
    ...patch,
  })
  batch.update(doc(database, 'households', homeId), { activeInviteId: id })
  return batch.commit()
}
function joinBatch(
  principal,
  {
    homeId = 'P',
    inviteId = invitationP,
    userHome = homeId,
    memberId = principal.uid,
    usedBy = principal.uid,
    parts = ['user', 'home', 'invite'],
    userPatch = {},
    homePatch = {},
    invitePatch = {},
  } = {},
) {
  const { database, uid } = principal,
    batch = writeBatch(database)
  if (parts.includes('user'))
    batch.set(doc(database, 'users', uid ?? 'fake'), {
      householdId: userHome,
      createdAt: serverTimestamp(),
      ...userPatch,
    })
  if (parts.includes('home'))
    batch.update(doc(database, 'households', homeId), {
      memberIds: arrayUnion(memberId),
      activeInviteId: null,
      ...homePatch,
    })
  if (parts.includes('invite'))
    batch.update(doc(database, 'householdInvites', inviteId), {
      usedBy,
      usedAt: serverTimestamp(),
      ...invitePatch,
    })
  return batch.commit()
}
async function inspectState() {
  return snapshotWorld()
}
function raceResults(results, expectedSuccesses) {
  assert.equal(
    results.filter((result) => result.status === 'fulfilled').length,
    expectedSuccesses,
  )
  for (const result of results)
    if (result.status === 'rejected')
      assert.equal(result.reason.code, 'permission-denied')
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
    raceResults(results, 1)
    const saved = await inspectState(),
      winner = saved['users/owner'].householdId
    assert(['one', 'two'].includes(winner))
    assert.deepEqual(saved[`households/${winner}`].memberIds, ['owner'])
    assert.equal(
      saved[`households/${winner === 'one' ? 'two' : 'one'}`],
      undefined,
    )
  })
  await test('concurrent invite consumers commit only one member', async () => {
    await create(owner, 'owner')
    await issue()
    const results = await Promise.allSettled([
      join(),
      join(db('second', 'partner@example.test'), 'second'),
    ])
    raceResults(results, 1)
    const snapshot = await getDoc(doc(owner, 'households', 'home'))
    assert.equal(snapshot.data().memberIds.length, 2)
    const saved = await inspectState(),
      winner = snapshot.data().memberIds[1],
      loser = winner === 'partner' ? 'second' : 'partner'
    assert.equal(saved['householdInvites/' + code].usedBy, winner)
    assert(saved['householdInvites/' + code].usedAt instanceof Timestamp)
    assert.equal(saved['users/' + winner].householdId, 'home')
    assert.equal(saved['users/' + loser], undefined)
    assert.equal(snapshot.data().activeInviteId, null)
  })
  await test('malformed invitation email cannot be written directly', async () => {
    await fixtures()
    for (const email of [
      'bad\t@example.test',
      'bad\n@example.test',
      ' guest@example.test',
      'guest@example.test ',
      'x'.repeat(255) + '@example.test',
    ]) {
      await deny(
        () =>
          directIssue(principals.inviter, rotatedCode, { targetEmail: email }),
        'invalid target email',
      )
    }
  })
  await test('role matrix: single-document access and no listing or filtered searching', async () => {
    await fixtures()
    const reads = [
      ['users/alice', ['owner']],
      ['households/A', ['owner', 'member']],
      ['householdInvites/' + invitationA, ['owner']],
      ['householdInvites/' + invitationP, ['inviter', 'guest']],
      ['users/bob', ['otherOwner']],
      ['households/B', ['otherOwner', 'otherMember']],
      ['householdInvites/' + invitationB, ['otherOwner']],
    ]
    for (const [role, principal] of Object.entries(principals)) {
      if (role !== 'unverified' && role !== 'anonymous')
        await allow(() =>
          getDoc(doc(principal.database, 'users', principal.uid)),
        )
      for (const [path, allowed] of reads) {
        const operation = () => getDoc(doc(principal.database, path))
        if (allowed.includes(role)) await allow(operation)
        else await denyRead(operation, `${role}: get ${path.split('/')[0]}`)
      }
      for (const path of supportedCollections) {
        await denyRead(
          () => getDocs(collection(principal.database, path)),
          `${role}: list ${path}`,
        )
        await denyRead(
          () => getDocs(collectionGroup(principal.database, path)),
          `${role}: collection group ${path}`,
        )
        const field =
          path === 'users'
            ? 'householdId'
            : path === 'households'
              ? 'ownerId'
              : 'targetEmail'
        const value =
          path === 'users'
            ? 'A'
            : path === 'households'
              ? 'alice'
              : 'guest@example.test'
        await denyRead(
          () =>
            getDocs(
              query(
                collection(principal.database, path),
                where(field, '==', value),
              ),
            ),
          `${role}: filtered query ${path}`,
        )
      }
    }
  })
  await test('role matrix: create requires fresh verified identity; immutable records cannot update or delete', async () => {
    for (const [role, principal] of Object.entries(principals)) {
      await fixtures()
      if (role === 'guest') await allow(() => directCreate(principal, 'new'))
      else
        await deny(
          () => directCreate(principal, 'new'),
          `${role}: create household`,
        )
      for (const path of [
        'users/alice',
        'households/A',
        'householdInvites/' + invitationA,
      ]) {
        await deny(
          () => updateDoc(doc(principal.database, path), { intruder: true }),
          `${role}: alter ${path.split('/')[0]}`,
        )
        await deny(
          () => deleteDoc(doc(principal.database, path)),
          `${role}: delete ${path.split('/')[0]}`,
        )
      }
      await fixtures()
      if (role === 'inviter') await allow(() => directIssue(principal))
      else
        await deny(
          () => directIssue(principal),
          `${role}: issue other household invite`,
        )
      await fixtures()
      const cancel = () =>
        updateDoc(doc(principal.database, 'households', 'P'), {
          activeInviteId: null,
        })
      if (role === 'inviter') await allow(cancel)
      else await deny(cancel, `${role}: cancel other household invite`)
      await fixtures()
      if (role === 'guest') await allow(() => joinBatch(principal))
      else await deny(() => joinBatch(principal), `${role}: consume invitation`)
    }
  })
  await test('unsupported business paths deny every role and every operation', async () => {
    await fixtures()
    for (const [role, principal] of Object.entries(principals))
      for (const path of unsupportedPaths) {
        const reference = doc(principal.database, path),
          parent = reference.parent
        await denyRead(() => getDoc(reference), `${role}: unsupported get`)
        await denyRead(() => getDocs(parent), `${role}: unsupported list`)
        await denyRead(
          () =>
            getDocs(
              query(parent, where('title', '==', 'unsupported test fixture')),
            ),
          `${role}: unsupported query`,
        )
        for (const [label, operation] of [
          ['create', () => setDoc(doc(parent, 'new'), { title: 'new' })],
          ['update', () => updateDoc(reference, { title: 'changed' })],
          ['delete', () => deleteDoc(reference)],
        ]) {
          await deny(operation, `${role}: unsupported ${label}`, [
            path,
            `${parent.path}/new`,
          ])
        }
      }
  })
  await test('schemas reject missing required fields, extra fields, types and forged creation timestamps', async () => {
    await fixtures()
    const guest = principals.guest
    const past = Timestamp.fromMillis(1000),
      future = Timestamp.fromMillis(Date.now() + 3600000)
    for (const patch of [
      { ownerId: 'alice' },
      { ownerId: 7 },
      { memberIds: ['guest', 'alice'] },
      { memberIds: ['guest', 'guest'] },
      { memberIds: 'guest' },
      { activeInviteId: rotatedCode },
      { name: null },
      { createdAt: past },
      { createdAt: future },
      { extra: true },
    ]) {
      await deny(
        () => directCreate(guest, 'new', patch),
        'invalid household create schema',
      )
    }
    for (const patch of [
      { householdId: 'A' },
      { householdId: 9 },
      { createdAt: past },
      { createdAt: future },
      { extra: true },
    ])
      await deny(
        () => directCreate(guest, 'new', {}, patch),
        'invalid membership schema',
      )
    for (const key of [
      'name',
      'ownerId',
      'memberIds',
      'activeInviteId',
      'createdAt',
    ]) {
      await deny(() => {
        const batch = writeBatch(guest.database),
          data = house('guest', ['guest'])
        delete data[key]
        batch.set(doc(guest.database, 'households', 'new'), data)
        batch.set(doc(guest.database, 'users', 'guest'), {
          householdId: 'new',
          createdAt: serverTimestamp(),
        })
        return batch.commit()
      }, `missing household ${key}`)
    }
    for (const key of ['householdId', 'createdAt'])
      await deny(() => {
        const batch = writeBatch(guest.database),
          data = { householdId: 'new', createdAt: serverTimestamp() }
        delete data[key]
        batch.set(
          doc(guest.database, 'households', 'new'),
          house('guest', ['guest']),
        )
        batch.set(doc(guest.database, 'users', 'guest'), data)
        return batch.commit()
      }, `missing membership ${key}`)
    for (const patch of [
      { householdId: 'A' },
      { householdId: 3 },
      { householdName: 'wrong' },
      { createdBy: 'alice' },
      { createdAt: past },
      { createdAt: future },
      { usedBy: 'guest' },
      { usedAt: past },
      { targetEmail: null },
      { extra: true },
    ])
      await deny(
        () => directIssue(principals.inviter, rotatedCode, patch),
        'invalid invite schema',
      )
    for (const key of [
      'householdId',
      'householdName',
      'createdBy',
      'targetEmail',
      'createdAt',
      'usedBy',
      'usedAt',
    ])
      await deny(() => {
        const batch = writeBatch(principals.inviter.database),
          data = {
            ...invitation('P', 'pat', 'guest@example.test'),
            createdAt: serverTimestamp(),
          }
        delete data[key]
        batch.set(
          doc(principals.inviter.database, 'householdInvites', rotatedCode),
          data,
        )
        batch.update(doc(principals.inviter.database, 'households', 'P'), {
          activeInviteId: rotatedCode,
        })
        return batch.commit()
      }, `missing invite ${key}`)
  })
  await test('partial and mixed atomic operations cannot change any related document', async () => {
    await fixtures()
    const guest = principals.guest
    for (const parts of [
      ['user'],
      ['home'],
      ['invite'],
      ['user', 'home'],
      ['user', 'invite'],
      ['home', 'invite'],
    ])
      await deny(() => joinBatch(guest, { parts }), 'partial join')
    for (const options of [
      { userHome: 'A' },
      { homeId: 'A' },
      { inviteId: invitationB },
      { memberId: 'alice' },
      { usedBy: 'alice' },
      { userPatch: { extra: true } },
      { homePatch: { ownerId: 'guest' } },
      { homePatch: { name: '改ざん' } },
      { homePatch: { memberIds: ['pat', 'guest', 'alice'] } },
      { homePatch: { memberIds: ['guest', 'pat'] } },
      { invitePatch: { targetEmail: 'alice@example.test' } },
      { invitePatch: { usedAt: Timestamp.fromMillis(1) } },
    ])
      await deny(() => joinBatch(guest, options), 'mixed or tampered join')
    await deny(
      () =>
        setDoc(doc(guest.database, 'users', 'alice'), {
          householdId: 'P',
          createdAt: serverTimestamp(),
        }),
      'foreign uid write',
    )
    await deny(
      () =>
        setDoc(
          doc(guest.database, 'households', 'orphan'),
          house('guest', ['guest']),
        ),
      'household without user',
    )
    await deny(
      () =>
        setDoc(
          doc(principals.inviter.database, 'householdInvites', rotatedCode),
          {
            ...invitation('P', 'pat', 'guest@example.test'),
            createdAt: serverTimestamp(),
          },
        ),
      'invite without active pointer',
    )
    await deny(
      () =>
        updateDoc(doc(principals.inviter.database, 'households', 'P'), {
          activeInviteId: rotatedCode,
        }),
      'active pointer without invite',
    )
    // 正常な参加を最後に行い、拒否テストが成功経路を壊していないことも確認する。
    await allow(() => joinBatch(guest))
  })
  await test('preview does not authorize participation after expiry, cancellation or rotation', async () => {
    for (const reason of ['expiry', 'cancel', 'rotate']) {
      await fixtures()
      await allow(() =>
        getDoc(doc(principals.guest.database, 'householdInvites', invitationP)),
      )
      if (reason === 'expiry')
        await env.withSecurityRulesDisabled((context) =>
          updateDoc(doc(context.firestore(), 'householdInvites', invitationP), {
            createdAt: Timestamp.fromMillis(Date.now() - 86400001),
          }),
        )
      if (reason === 'cancel')
        await allow(() =>
          updateDoc(doc(principals.inviter.database, 'households', 'P'), {
            activeInviteId: null,
          }),
        )
      if (reason === 'rotate')
        await allow(() => directIssue(principals.inviter))
      await deny(() => joinBatch(principals.guest), `join after ${reason}`)
    }
    await fixtures()
    await allow(() => joinBatch(principals.guest))
    await deny(() => joinBatch(principals.guest), 'used code replay')
    // 対象メール本人であっても、既存の所属から別世帯へ移れない。
    await fixtures()
    await allow(() =>
      directIssue(principals.inviter, rotatedCode, {
        targetEmail: 'alice@example.test',
      }),
    )
    await allow(() =>
      getDoc(doc(principals.owner.database, 'householdInvites', rotatedCode)),
    )
    await deny(
      () => joinBatch(principals.owner, { inviteId: rotatedCode }),
      'existing member cannot change household',
    )
  })
  await test('same user concurrently accepting two households ends in one consistent membership', async () => {
    await fixtures()
    await env.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore(),
        batch = writeBatch(database)
      batch.set(doc(database, 'households', 'Q'), {
        ...house('quinn', ['quinn'], rotatedCode),
        name: '世帯Q',
      })
      batch.set(doc(database, 'users', 'quinn'), {
        householdId: 'Q',
        createdAt: serverTimestamp(),
      })
      batch.set(
        doc(database, 'householdInvites', rotatedCode),
        invitation('Q', 'quinn', 'guest@example.test'),
      )
      await batch.commit()
    })
    const results = await Promise.allSettled([
      joinBatch(principals.guest),
      joinBatch(principals.guest, { homeId: 'Q', inviteId: rotatedCode }),
    ])
    raceResults(results, 1)
    const saved = await inspectState(),
      winner = saved['users/guest'].householdId,
      loser = winner === 'P' ? 'Q' : 'P'
    assert.deepEqual(saved[`households/${winner}`].memberIds, [
      winner === 'P' ? 'pat' : 'quinn',
      'guest',
    ])
    assert.equal(saved[`households/${loser}`].memberIds.length, 1)
    const wonCode = winner === 'P' ? invitationP : rotatedCode,
      lostCode = winner === 'P' ? rotatedCode : invitationP
    assert.equal(saved['householdInvites/' + wonCode].usedBy, 'guest')
    assert.equal(saved['householdInvites/' + lostCode].usedBy, null)
    assert.equal(saved[`households/${winner}`].activeInviteId, null)
    assert.equal(saved[`households/${loser}`].activeInviteId, lostCode)
  })
  await test('cancel or rotate racing with participation has exactly one valid winner', async () => {
    for (const kind of ['cancel', 'rotate']) {
      await fixtures()
      const change = () =>
        kind === 'cancel'
          ? updateDoc(doc(principals.inviter.database, 'households', 'P'), {
              activeInviteId: null,
            })
          : directIssue(principals.inviter)
      const results = await Promise.allSettled([
        joinBatch(principals.guest),
        change(),
      ])
      raceResults(results, 1)
      const saved = await inspectState(),
        joined = results[0].status === 'fulfilled'
      assert.deepEqual(
        saved['households/P'].memberIds,
        joined ? ['pat', 'guest'] : ['pat'],
      )
      assert.equal(
        saved['households/P'].activeInviteId,
        joined || kind === 'cancel' ? null : rotatedCode,
      )
      assert.equal(
        saved['householdInvites/' + invitationP].usedBy,
        joined ? 'guest' : null,
      )
      assert.equal(Boolean(saved['users/guest']), joined)
      assert.equal(
        Boolean(saved['householdInvites/' + rotatedCode]),
        !joined && kind === 'rotate',
      )
    }
  })
  console.log(
    `SUMMARY: ${scenarioCount} scenarios; ${allowedChecks} additional allow checks; ${deniedChecks} additional permission-denied checks`,
  )
} finally {
  await env.cleanup()
}
