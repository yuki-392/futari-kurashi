import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  query,
  limit,
  setLogLevel,
  runTransaction,
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
const a = db('ra'),
  b = db('rb'),
  others = [
    db('rx'),
    db('rn'),
    db('ra', false),
    env.unauthenticatedContext().firestore(),
  ]
const ref = (d, c, id) => doc(d, 'households', 'rule-home', c, id)
const rule = (patch = {}) => ({
  title: '暮らしの約束',
  body: '内容を確認する',
  categoryId: 'chores',
  categoryName: '家事',
  reviewDate: '2026-10-23',
  archived: false,
  contentVersion: 1,
  version: 1,
  agreedUids: [],
  lastAction: 'create',
  createdAt: serverTimestamp(),
  createdBy: 'ra',
  updatedAt: serverTimestamp(),
  updatedBy: 'ra',
  ...patch,
})
const category = (patch = {}) => ({
  name: '独自',
  standard: false,
  archived: false,
  version: 1,
  createdAt: serverTimestamp(),
  createdBy: 'ra',
  updatedAt: serverTimestamp(),
  updatedBy: 'ra',
  ...patch,
})
let allowed = 0,
  denied = 0
async function yes(p) {
  try {
    await assertSucceeds(p)
    allowed++
  } catch (e) {
    console.error('Failed allow assertion', allowed + 1)
    throw e
  }
}
async function raw() {
  let result
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    result = {
      categories: (
        await getDocs(collection(d, 'households/rule-home/ruleCategories'))
      ).docs.map((x) => [x.id, x.data()]),
      rules: [],
    }
    for (const r of (
      await getDocs(collection(d, 'households/rule-home/houseRules'))
    ).docs)
      result.rules.push([
        r.id,
        r.data(),
        (
          await getDocs(
            collection(d, 'households/rule-home/houseRules', r.id, 'history'),
          )
        ).docs.map((x) => [x.id, x.data()]),
      ])
  })
  return result
}
async function no(fn) {
  const before = await raw(),
    error = await assertFails(fn())
  assert.equal(error.code, 'permission-denied')
  assert.deepEqual(await raw(), before)
  denied++
}
function create(d, id = 'r', patch = {}, historyPatch) {
  const batch = writeBatch(d),
    data = rule(patch)
  batch.set(ref(d, 'houseRules', id), data)
  batch.set(
    doc(d, 'households/rule-home/houseRules', id, 'history', '1'),
    historyPatch ?? { snapshot: data },
  )
  return batch.commit()
}
async function change(d, id, patch, historyPatch) {
  const old = (await getDoc(ref(d, 'houseRules', id))).data(),
    data = {
      ...old,
      version: old.version + 1,
      updatedAt: serverTimestamp(),
      updatedBy: 'ra',
      ...patch,
    }
  const batch = writeBatch(d)
  batch.set(ref(d, 'houseRules', id), data)
  batch.set(
    doc(
      d,
      'households/rule-home/houseRules',
      id,
      'history',
      String(data.version),
    ),
    historyPatch ?? { snapshot: data },
  )
  return batch.commit()
}
try {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    await setDoc(doc(d, 'households/rule-home'), {
      ownerId: 'ra',
      memberIds: ['ra', 'rb'],
    })
    await setDoc(doc(d, 'households/foreign'), {
      ownerId: 'rx',
      memberIds: ['rx'],
    })
    for (const uid of ['ra', 'rb'])
      await setDoc(doc(d, 'users', uid), { householdId: 'rule-home' })
    await setDoc(doc(d, 'users/rx'), { householdId: 'foreign' })
  })
  await yes(
    setDoc(
      ref(a, 'ruleCategories', 'chores'),
      category({ name: '家事', standard: true }),
    ),
  )
  await yes(setDoc(ref(a, 'ruleCategories', 'custom'), category()))
  async function initialize(d, uid) {
    for (let attempt = 0; ; attempt++)
      try {
        return await runTransaction(d, async (tx) => {
          const standards = [
            ['chores', '家事'],
            ['money', 'お金'],
            ['habits', '生活習慣'],
            ['space', '共有スペース'],
            ['other', 'その他'],
          ]
          const refs = standards.map(([id]) => ref(d, 'ruleCategories', id)),
            snapshots = await Promise.all(refs.map((r) => tx.get(r)))
          refs.forEach((r, i) => {
            if (!snapshots[i].exists())
              tx.set(
                r,
                category({
                  name: standards[i][1],
                  standard: true,
                  createdBy: uid,
                  updatedBy: uid,
                }),
              )
          })
        })
      } catch (e) {
        if (attempt >= 2 || !['permission-denied', 'aborted'].includes(e.code))
          throw e
      }
  }
  await yes(Promise.all([initialize(a, 'ra'), initialize(b, 'rb')]))
  assert.equal(
    (
      await getDocs(
        query(collection(a, 'households/rule-home/ruleCategories'), limit(101)),
      )
    ).size,
    6,
  )
  await yes(create(a))
  await yes(create(a, 'body-boundary', { body: 'あ'.repeat(2000) }))
  await yes(create(a, 'emoji-boundary', { body: '🏠'.repeat(2000) }))
  await yes(getDoc(ref(b, 'houseRules', 'r')))
  await yes(
    getDocs(
      query(collection(b, 'households/rule-home/houseRules'), limit(101)),
    ),
  )
  await yes(
    getDocs(
      query(
        collection(b, 'households/rule-home/houseRules/r/history'),
        limit(101),
      ),
    ),
  )
  for (const d of others)
    for (const [c, id] of [
      ['ruleCategories', 'chores'],
      ['houseRules', 'r'],
      ['houseRules/r/history', '1'],
    ]) {
      await no(() => getDoc(ref(d, c, id)))
      await no(() =>
        getDocs(query(collection(d, 'households/rule-home', c), limit(101))),
      )
      await no(() =>
        setDoc(
          ref(d, c, 'bad'),
          c === 'ruleCategories'
            ? category()
            : c === 'houseRules'
              ? rule()
              : { snapshot: rule() },
        ),
      )
      await no(() => deleteDoc(ref(d, c, id)))
    }
  for (const c of ['houseRules', 'ruleCategories', 'houseRules/r/history']) {
    await no(() => getDocs(collection(a, 'households/rule-home', c)))
    await no(() =>
      getDocs(query(collection(a, 'households/rule-home', c), limit(10002))),
    )
  }
  for (const patch of [
    { title: '' },
    { title: ' x ' },
    { title: 'あ'.repeat(101) },
    { body: '' },
    { body: 'x'.repeat(2001) },
    { reviewDate: '2026-02-29' },
    { reviewDate: '2026-13-01' },
    { reviewDate: 1 },
    { categoryId: 'missing' },
    { categoryName: '別名' },
    { agreedUids: ['ra'] },
    { agreedUids: ['rx'] },
    { archived: true },
    { contentVersion: 2 },
    { version: 2 },
    { createdBy: 'rb' },
    { createdAt: new Date(0) },
    { updatedBy: 'rb' },
    { extra: 1 },
  ])
    await no(() => create(a, 'bad', patch))
  for (const key of Object.keys(rule())) {
    const data = rule()
    delete data[key]
    await no(() => {
      const w = writeBatch(a)
      w.set(ref(a, 'houseRules', 'bad'), data)
      w.set(doc(a, 'households/rule-home/houseRules/bad/history/1'), {
        snapshot: data,
      })
      return w.commit()
    })
  }
  await no(() => setDoc(ref(a, 'houseRules', 'solo'), rule()))
  await no(() =>
    setDoc(doc(a, 'households/rule-home/houseRules/r/history/2'), {
      snapshot: rule({ version: 2 }),
    }),
  )
  await no(() =>
    updateDoc(ref(a, 'houseRules', 'r'), {
      version: 2,
      lastAction: 'agree',
      agreedUids: ['ra'],
      updatedAt: serverTimestamp(),
    }),
  )
  await no(() =>
    create(a, 'bad', {}, { snapshot: rule({ title: '別の履歴' }) }),
  )
  await yes(change(a, 'r', { lastAction: 'agree', agreedUids: ['ra'] }))
  await no(() =>
    change(a, 'r', { lastAction: 'agree', agreedUids: ['ra', 'rb'] }),
  )
  await no(() =>
    change(b, 'r', { lastAction: 'withdraw', agreedUids: [], updatedBy: 'rb' }),
  )
  await yes(
    change(b, 'r', {
      lastAction: 'agree',
      agreedUids: ['ra', 'rb'],
      updatedBy: 'rb',
    }),
  )
  await no(() => change(a, 'r', { lastAction: 'withdraw', agreedUids: [] }))
  await yes(change(a, 'r', { lastAction: 'withdraw', agreedUids: ['rb'] }))
  for (const patch of [
    { title: '新しい内容', lastAction: 'agree', agreedUids: ['ra', 'rb'] },
    { lastAction: 'edit', title: '新', contentVersion: 2, agreedUids: ['rb'] },
    { lastAction: 'edit', title: '新', contentVersion: 1, agreedUids: [] },
    {
      lastAction: 'edit',
      title: '新',
      contentVersion: 2,
      agreedUids: [],
      createdBy: 'rb',
    },
    {
      lastAction: 'edit',
      title: '新',
      contentVersion: 2,
      agreedUids: [],
      updatedAt: new Date(0),
    },
  ])
    await no(() => change(a, 'r', patch))
  await yes(
    change(a, 'r', {
      lastAction: 'edit',
      title: '新',
      contentVersion: 2,
      agreedUids: [],
    }),
  )
  await yes(change(a, 'r', { lastAction: 'retire', archived: true }))
  for (const action of ['agree', 'withdraw', 'edit', 'retire'])
    await no(() =>
      change(a, 'r', {
        lastAction: action,
        agreedUids: action === 'agree' ? ['ra'] : [],
        contentVersion: action === 'edit' ? 3 : 2,
      }),
    )
  await yes(
    change(b, 'r', {
      lastAction: 'restore',
      archived: false,
      contentVersion: 3,
      agreedUids: [],
      updatedBy: 'rb',
    }),
  )
  await no(() => deleteDoc(ref(a, 'houseRules', 'r')))
  await no(() =>
    deleteDoc(doc(a, 'households/rule-home/houseRules/r/history/1')),
  )
  await no(() =>
    updateDoc(doc(a, 'households/rule-home/houseRules/r/history/1'), {
      extra: 1,
    }),
  )
  await yes(
    updateDoc(ref(b, 'ruleCategories', 'chores'), {
      archived: true,
      version: 2,
      updatedAt: serverTimestamp(),
      updatedBy: 'rb',
    }),
  )
  await initialize(a, 'ra')
  assert.equal(
    (await getDoc(ref(a, 'ruleCategories', 'chores'))).data().archived,
    true,
  )
  await no(() => create(a, 'bad'))
  await yes(
    change(a, 'r', {
      lastAction: 'edit',
      body: '分類を保持',
      contentVersion: 4,
      agreedUids: [],
    }),
  )
  await no(() =>
    change(a, 'r', {
      lastAction: 'edit',
      categoryId: 'other',
      categoryName: '別世帯',
      contentVersion: 5,
      agreedUids: [],
    }),
  )
  await yes(
    updateDoc(ref(a, 'ruleCategories', 'chores'), {
      archived: false,
      version: 3,
      updatedAt: serverTimestamp(),
      updatedBy: 'ra',
    }),
  )
  for (const patch of [
    { name: ' x ' },
    { name: '' },
    { name: 'あ'.repeat(41) },
    { standard: true },
    { archived: true },
    { version: 2 },
    { createdBy: 'rb' },
    { updatedBy: 'rb' },
    { createdAt: new Date(0) },
    { extra: true },
  ])
    await no(() => setDoc(ref(a, 'ruleCategories', 'bad'), category(patch)))
  for (const patch of [
    { name: '変更' },
    { standard: false },
    { version: 3 },
    { createdBy: 'rb' },
    { extra: 1 },
  ])
    await no(() =>
      updateDoc(ref(a, 'ruleCategories', 'chores'), {
        ...patch,
        updatedAt: serverTimestamp(),
      }),
    )
  await no(() => deleteDoc(ref(a, 'ruleCategories', 'custom')))
  await yes(create(a, 'race'))
  async function agree(d, uid) {
    const perform = () =>
      runTransaction(d, async (tx) => {
        const r = ref(d, 'houseRules', 'race'),
          snapshot = await tx.get(r),
          old = snapshot.data()
        assert.equal(old.contentVersion, 1)
        if (old.agreedUids.includes(uid)) return
        const data = {
          ...old,
          version: old.version + 1,
          lastAction: 'agree',
          agreedUids: [...old.agreedUids, uid].sort(),
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        }
        tx.set(r, data)
        tx.set(
          doc(
            d,
            'households/rule-home/houseRules/race/history',
            String(data.version),
          ),
          { snapshot: data },
        )
      })
    for (let attempt = 0; ; attempt++) {
      try {
        return await perform()
      } catch (e) {
        if (attempt >= 2 || !['permission-denied', 'aborted'].includes(e.code))
          throw e
      }
    }
  }
  await Promise.all([agree(a, 'ra'), agree(b, 'rb')])
  const after = (await getDoc(ref(a, 'houseRules', 'race'))).data()
  assert.deepEqual(after.agreedUids, ['ra', 'rb'])
  assert.equal(after.version, 3)
  assert.equal(
    (
      await getDocs(
        query(
          collection(a, 'households/rule-home/houseRules/race/history'),
          limit(101),
        ),
      )
    ).size,
    3,
  )
  await yes(create(a, 'edit-race'))
  const raceBefore = (await getDoc(ref(a, 'houseRules', 'edit-race'))).data()
  function raceWrite(d, patch) {
    const data = {
        ...raceBefore,
        version: 2,
        updatedAt: serverTimestamp(),
        ...patch,
      },
      w = writeBatch(d)
    w.set(ref(d, 'houseRules', 'edit-race'), data)
    w.set(doc(d, 'households/rule-home/houseRules/edit-race/history/2'), {
      snapshot: data,
    })
    return w.commit()
  }
  const races = await Promise.allSettled([
    raceWrite(a, { lastAction: 'edit', title: '変更', contentVersion: 2 }),
    raceWrite(b, { lastAction: 'agree', agreedUids: ['rb'], updatedBy: 'rb' }),
  ])
  assert.equal(
    races.find((r) => r.status === 'rejected').reason.code,
    'permission-denied',
  )
  const final = (await getDoc(ref(a, 'houseRules', 'edit-race'))).data()
  assert.equal(final.version, 2)
  assert.equal(
    final.lastAction === 'edit'
      ? final.agreedUids.length
      : final.contentVersion,
    final.lastAction === 'edit' ? 0 : 1,
  )
  for (const [id, second] of [
    [
      'two-edits',
      { lastAction: 'edit', title: '相手の変更', contentVersion: 2 },
    ],
    ['edit-retire', { lastAction: 'retire', archived: true }],
  ]) {
    await yes(create(a, id))
    const before = (await getDoc(ref(a, 'houseRules', id))).data()
    const commit = (d, patch, uid) => {
      const data = {
        ...before,
        ...patch,
        version: 2,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      }
      const batch = writeBatch(d)
      batch.set(ref(d, 'houseRules', id), data)
      batch.set(doc(d, `households/rule-home/houseRules/${id}/history/2`), {
        snapshot: data,
      })
      return batch.commit()
    }
    const results = await Promise.allSettled([
      commit(
        a,
        { lastAction: 'edit', title: '本人の変更', contentVersion: 2 },
        'ra',
      ),
      commit(b, second, 'rb'),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.code,
      'permission-denied',
    )
    const current = (await getDoc(ref(a, 'houseRules', id))).data()
    const history = await getDocs(
      query(
        collection(a, `households/rule-home/houseRules/${id}/history`),
        limit(100),
      ),
    )
    assert.equal(current.version, 2)
    assert.equal(history.size, 2)
    assert.deepEqual(
      history.docs.find((d) => d.id === '2').data().snapshot,
      current,
    )
    assert.equal(current.contentVersion, current.lastAction === 'edit' ? 2 : 1)
    assert.equal(current.archived, current.lastAction === 'retire')
    assert.deepEqual(current.agreedUids, [])
  }
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    await setDoc(doc(d, 'households/solo-rules'), {
      ownerId: 'rs',
      memberIds: ['rs'],
    })
    await setDoc(doc(d, 'users/rs'), { householdId: 'solo-rules' })
  })
  const single = db('rs')
  await yes(
    setDoc(
      doc(single, 'households/solo-rules/ruleCategories/chores'),
      category({
        name: '家事',
        standard: true,
        createdBy: 'rs',
        updatedBy: 'rs',
      }),
    ),
  )
  const one = rule({ createdBy: 'rs', updatedBy: 'rs' }),
    singleRule = doc(single, 'households/solo-rules/houseRules/r')
  const w = writeBatch(single)
  w.set(singleRule, one)
  w.set(doc(single, 'households/solo-rules/houseRules/r/history/1'), {
    snapshot: one,
  })
  await yes(w.commit())
  const oneAgreed = {
    ...(await getDoc(singleRule)).data(),
    version: 2,
    lastAction: 'agree',
    agreedUids: ['rs'],
    updatedAt: serverTimestamp(),
  }
  const w2 = writeBatch(single)
  w2.set(singleRule, oneAgreed)
  w2.set(doc(single, 'households/solo-rules/houseRules/r/history/2'), {
    snapshot: oneAgreed,
  })
  await yes(w2.commit())
  console.log(
    `House rules permissions passed: ${allowed} allowed / ${denied} denied; schemas, categories, immutable snapshots, self-only agreements, retirement, atomicity and concurrent operations`,
  )
} finally {
  await env.cleanup()
}
