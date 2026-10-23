import { beforeEach, expect, it, vi } from 'vitest'
import {
  changeHouseRule,
  ensureRuleCategories,
  watchRuleCollection,
} from './service'
import type { HouseRule } from './model'
const m = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  writes: [] as { ref: string; data: Record<string, unknown> }[],
  listen: vi.fn(),
  stop: vi.fn(),
  failures: 0,
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...p: string[]) => p.join('/'),
  doc: (_db: unknown, ...p: string[]) => p.join('/'),
  serverTimestamp: () => 'server',
  where: (...p: unknown[]) => p,
  limit: (n: number) => n,
  orderBy: (...p: unknown[]) => p,
  query: (...p: unknown[]) => p,
  onSnapshot: m.listen,
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) =>
    m.failures-- > 0
      ? Promise.reject(
          Object.assign(new Error(), { code: 'permission-denied' }),
        )
      : fn({
          get: async (ref: string) => ({
            exists: () => m.data.has(ref),
            data: () => m.data.get(ref),
          }),
          set: (ref: string, data: Record<string, unknown>) =>
            m.writes.push({ ref, data }),
        }),
}))
const rule: HouseRule = {
  id: 'r',
  title: 'ルール',
  body: '内容',
  categoryId: 'chores',
  categoryName: '家事',
  reviewDate: null,
  archived: false,
  contentVersion: 1,
  version: 1,
  agreedUids: [],
  lastAction: 'create',
  createdAt: 'created',
  createdBy: 'a',
  updatedAt: 'created',
  updatedBy: 'a',
}
beforeEach(() => {
  vi.clearAllMocks()
  m.data.clear()
  m.failures = 0
  m.writes = []
  m.data.set('households/h', { memberIds: ['a', 'b'] })
  m.data.set('households/h/houseRules/r', rule)
  m.data.set('households/h/ruleCategories/chores', {
    name: '家事',
    archived: false,
  })
  m.listen.mockReturnValue(m.stop)
})
it('preserves a simultaneous counterpart agreement using fresh state and records one matching immutable snapshot', async () => {
  m.data.set('households/h/houseRules/r', {
    ...rule,
    version: 2,
    agreedUids: ['b'],
  })
  await changeHouseRule('h', 'a', rule, 'agree')
  expect(m.writes).toHaveLength(2)
  expect(m.writes[0]!.data).toMatchObject({
    version: 3,
    contentVersion: 1,
    agreedUids: ['a', 'b'],
    updatedBy: 'a',
    updatedAt: 'server',
  })
  expect(m.writes[1]).toMatchObject({
    ref: 'households/h/houseRules/r/history/3',
    data: { snapshot: m.writes[0]!.data },
  })
})
it('rejects stale content agreement, stale edit and retired-rule operation without writes', async () => {
  m.data.set('households/h/houseRules/r', {
    ...rule,
    version: 2,
    contentVersion: 2,
  })
  await expect(changeHouseRule('h', 'a', rule, 'agree')).rejects.toMatchObject({
    code: 'rule-conflict',
  })
  await expect(
    changeHouseRule('h', 'a', rule, 'edit', rule),
  ).rejects.toMatchObject({ code: 'rule-conflict' })
  expect(m.writes).toHaveLength(0)
})
it('does not recreate archived standard categories; repeated own agreement is idempotent', async () => {
  m.data.set('households/h/ruleCategories/chores', {
    name: '家事',
    archived: true,
  })
  await ensureRuleCategories('h', 'a')
  expect(m.writes).toHaveLength(4)
  expect(m.writes.some((w) => w.ref.endsWith('/chores'))).toBe(false)
  m.writes = []
  m.data.set('households/h/houseRules/r', {
    ...rule,
    version: 2,
    agreedUids: ['a'],
  })
  await changeHouseRule('h', 'a', rule, 'agree')
  expect(m.writes).toHaveLength(0)
})
it('retains archived category on an existing edit but refuses assigning it from elsewhere', async () => {
  m.data.set('households/h/ruleCategories/chores', {
    name: '家事',
    archived: true,
  })
  await changeHouseRule('h', 'a', rule, 'edit', { ...rule, title: '変更後' })
  expect(m.writes[0]!.data).toMatchObject({
    categoryName: '家事',
    contentVersion: 2,
    agreedUids: [],
  })
  m.writes = []
  m.data.set('households/h/ruleCategories/money', {
    name: 'お金',
    archived: true,
  })
  await expect(
    changeHouseRule('h', 'a', rule, 'edit', { ...rule, categoryId: 'money' }),
  ).rejects.toThrow('カテゴリ')
  expect(m.writes).toHaveLength(0)
})
it('returns new bounded server snapshots, ignores pending/cache, unsubscribes and does not publish after failure', async () => {
  let next: (s: unknown) => void = () => {},
    fail = () => {}
  m.listen.mockImplementation(
    (_q: unknown, _o: unknown, n: (s: unknown) => void, f: () => void) => {
      next = n
      fail = f
      return m.stop
    },
  )
  const publish = vi.fn(),
    error = vi.fn()
  const stop = watchRuleCollection(
    'h',
    { kind: 'rules', count: 100, archived: false, categoryId: 'chores' },
    publish,
    error,
  )
  await vi.waitFor(() => expect(m.listen).toHaveBeenCalledOnce())
  const snap = (pending = false) => ({
    metadata: { fromCache: false, hasPendingWrites: pending },
    docs: [{ id: 'r', data: () => rule }],
  })
  next(snap(true))
  expect(publish).not.toHaveBeenCalled()
  next(snap())
  const previous = publish.mock.lastCall![0]
  next(snap())
  expect(publish.mock.lastCall![0]).not.toBe(previous)
  fail()
  next(snap())
  expect(error).toHaveBeenCalledOnce()
  expect(publish).toHaveBeenCalledTimes(2)
  stop()
  expect(m.stop).toHaveBeenCalledOnce()
})

it('retries only agreement contention, preserves counterpart and still rejects stale content', async () => {
  m.failures = 1
  m.data.set('households/h/houseRules/r', {
    ...rule,
    version: 2,
    agreedUids: ['b'],
  })
  await changeHouseRule('h', 'a', rule, 'agree')
  expect(m.writes[0]!.data.agreedUids).toEqual(['a', 'b'])
  m.writes = []
  m.failures = 1
  m.data.set('households/h/houseRules/r', {
    ...rule,
    version: 2,
    contentVersion: 2,
  })
  await expect(changeHouseRule('h', 'a', rule, 'agree')).rejects.toMatchObject({
    code: 'rule-conflict',
  })
  expect(m.writes).toHaveLength(0)
})

it('rechecks standard-category existence after an initialization collision without reviving archived values', async () => {
  m.failures = 1
  m.data.set('households/h/ruleCategories/chores', {
    name: '家事',
    archived: true,
  })
  await ensureRuleCategories('h', 'a')
  expect(m.writes).toHaveLength(4)
  expect(m.writes.some((w) => w.ref.endsWith('/chores'))).toBe(false)
})
