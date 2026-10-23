import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import { cleanRuleInput, ruleChange, standardRuleCategories } from './model'
import type {
  HouseRule,
  RuleAction,
  RuleCategory,
  RuleHistory,
  RuleInput,
} from './model'
function online() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error(), { code: 'offline' })
}
const conflict = () => Object.assign(new Error(), { code: 'rule-conflict' })
const audit = (uid: string) => ({
  updatedAt: serverTimestamp(),
  updatedBy: uid,
})
export async function ensureRuleCategories(hid: string, uid: string) {
  online()
  const { db } = await getFirebaseServices()
  const perform = () =>
    runTransaction(db, async (tx) => {
      const refs = standardRuleCategories.map((c) =>
          doc(db, 'households', hid, 'ruleCategories', c.id),
        ),
        snaps = await Promise.all(refs.map((r) => tx.get(r)))
      refs.forEach((ref, i) => {
        if (!snaps[i]!.exists())
          tx.set(ref, {
            name: standardRuleCategories[i]!.name,
            standard: true,
            archived: false,
            version: 1,
            createdAt: serverTimestamp(),
            createdBy: uid,
            ...audit(uid),
          })
      })
    })
  await retryRuleWrite(perform, true)
}
export async function createRuleCategory(
  hid: string,
  uid: string,
  raw: string,
) {
  online()
  const name = raw.trim()
  if (Array.from(name).length < 1 || Array.from(name).length > 40)
    throw new Error('カテゴリ名は1〜40文字で入力してください。')
  const { db } = await getFirebaseServices(),
    target = doc(collection(db, 'households', hid, 'ruleCategories'))
  await runTransaction(db, async (tx) => {
    if ((await tx.get(target)).exists()) throw conflict()
    tx.set(target, {
      name,
      standard: false,
      archived: false,
      version: 1,
      createdAt: serverTimestamp(),
      createdBy: uid,
      ...audit(uid),
    })
  })
}
export async function setRuleCategoryArchived(
  hid: string,
  uid: string,
  expected: RuleCategory,
  archived: boolean,
) {
  online()
  const { db } = await getFirebaseServices(),
    ref = doc(db, 'households', hid, 'ruleCategories', expected.id)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists() || snap.data().version !== expected.version)
      throw conflict()
    tx.set(ref, {
      ...snap.data(),
      archived,
      version: expected.version + 1,
      ...audit(uid),
    })
  })
}
function stored(value: HouseRule) {
  const data = { ...value } as Partial<HouseRule>
  delete data.id
  return data
}
export async function createHouseRule(
  hid: string,
  uid: string,
  input: RuleInput,
) {
  online()
  const data = cleanRuleInput(input),
    { db } = await getFirebaseServices(),
    ref = doc(collection(db, 'households', hid, 'houseRules'))
  await runTransaction(db, async (tx) => {
    const [existing, category] = await Promise.all([
      tx.get(ref),
      tx.get(doc(db, 'households', hid, 'ruleCategories', data.categoryId)),
    ])
    if (existing.exists()) throw conflict()
    if (!category.exists() || category.data().archived)
      throw new Error('有効なカテゴリを選んでください。')
    const result = {
      ...data,
      categoryName: category.data().name,
      archived: false,
      contentVersion: 1,
      version: 1,
      agreedUids: [],
      lastAction: 'create',
      createdAt: serverTimestamp(),
      createdBy: uid,
      ...audit(uid),
    }
    tx.set(ref, result)
    tx.set(doc(db, 'households', hid, 'houseRules', ref.id, 'history', '1'), {
      snapshot: result,
    })
  })
}
export async function changeHouseRule(
  hid: string,
  uid: string,
  expected: HouseRule,
  action: Exclude<RuleAction, 'create'>,
  input?: RuleInput,
) {
  online()
  const { db } = await getFirebaseServices(),
    ref = doc(db, 'households', hid, 'houseRules', expected.id)
  const perform = () =>
    runTransaction(db, async (tx) => {
      const [snap, home] = await Promise.all([
        tx.get(ref),
        tx.get(doc(db, 'households', hid)),
      ])
      if (!snap.exists()) throw conflict()
      const current = { ...snap.data(), id: expected.id } as HouseRule
      if (action === 'agree' || action === 'withdraw') {
        if (current.contentVersion !== expected.contentVersion) throw conflict()
      } else if (current.version !== expected.version) throw conflict()
      const next = ruleChange(
        current,
        action,
        uid,
        home.data()!.memberIds,
        input,
      )
      if (!next) return
      if (action === 'edit' || action === 'restore') {
        const category = await tx.get(
          doc(db, 'households', hid, 'ruleCategories', next.categoryId),
        )
        if (
          !category.exists() ||
          (category.data().archived && next.categoryId !== current.categoryId)
        )
          throw new Error('有効なカテゴリを選んでください。')
        next.categoryName = category.data().name
      }
      const data = { ...stored(next), ...audit(uid) }
      tx.set(ref, data)
      tx.set(
        doc(
          db,
          'households',
          hid,
          'houseRules',
          expected.id,
          'history',
          String(next.version),
        ),
        { snapshot: data },
      )
    })
  await retryRuleWrite(perform, action === 'agree' || action === 'withdraw')
}
export type RuleQuery =
  | { kind: 'rules'; count: number; archived: boolean; categoryId?: string }
  | { kind: 'categories'; count: number }
  | { kind: 'history'; count: number; ruleId: string }
export function watchRuleCollection<
  T extends HouseRule | RuleCategory | RuleHistory,
>(
  hid: string,
  options: RuleQuery,
  next: (items: T[], more: boolean) => void,
  error: () => void,
) {
  let active = true,
    failed = false,
    stop: (() => void) | undefined
  const fail = () => {
    if (active && !failed) {
      failed = true
      error()
    }
  }
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      if (
        !Number.isInteger(options.count) ||
        options.count < 100 ||
        options.count > 10000
      )
        throw new Error('取得上限を確認してください。')
      const ref =
        options.kind === 'history'
          ? collection(
              db,
              'households',
              hid,
              'houseRules',
              options.ruleId,
              'history',
            )
          : collection(
              db,
              'households',
              hid,
              options.kind === 'categories' ? 'ruleCategories' : 'houseRules',
            )
      const conditions =
        options.kind === 'rules'
          ? [
              where('archived', '==', options.archived),
              ...(options.categoryId
                ? [where('categoryId', '==', options.categoryId)]
                : []),
            ]
          : []
      stop = onSnapshot(
        query(
          ref,
          ...conditions,
          orderBy(
            options.kind === 'history'
              ? 'snapshot.version'
              : options.kind === 'categories'
                ? 'createdAt'
                : 'updatedAt',
            options.kind === 'categories' ? 'asc' : 'desc',
          ),
          limit(options.count + 1),
        ),
        { includeMetadataChanges: true },
        (snap) => {
          if (
            !active ||
            failed ||
            snap.metadata.fromCache ||
            snap.metadata.hasPendingWrites
          )
            return
          next(
            snap.docs
              .slice(0, options.count)
              .map((d) => ({ ...d.data(), id: d.id }) as T),
            snap.docs.length > options.count,
          )
        },
        fail,
      )
    })
    .catch(fail)
  return () => {
    active = false
    stop?.()
  }
}

async function retryRuleWrite(perform: () => Promise<void>, retry: boolean) {
  for (let attempt = 0; ; attempt++) {
    try {
      await perform()
      return
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error ? error.code : ''
      if (
        !retry ||
        attempt >= 2 ||
        !['permission-denied', 'aborted'].includes(String(code))
      )
        throw error
    }
  }
}
