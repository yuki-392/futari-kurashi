import { beforeEach, expect, it, vi } from 'vitest'
import {
  saveBudget,
  removeBudget,
  copyPreviousBudgets,
  watchBudgets,
} from './budgetService'
const m = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  watch: vi.fn(),
  list: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_d: unknown, ...p: string[]) => p.join('/'),
  doc: (_d: unknown, ...p: string[]) => p.join('/'),
  where: (...p: unknown[]) => p,
  limit: (n: number) => n,
  query: (...p: unknown[]) => p,
  serverTimestamp: () => 'server',
  onSnapshot: m.watch,
  getDocsFromServer: m.list,
  runTransaction: async (_d: unknown, cb: (tx: typeof m) => unknown) => cb(m),
}))
const stamp = { toMillis: () => 1 }
const budget = {
  id: '2026-10__total',
  month: '2026-10',
  scope: 'total' as const,
  categoryId: null,
  amount: 100,
  version: 1,
  createdAt: stamp,
  createdBy: 'a',
  updatedAt: stamp,
  updatedBy: 'a',
}
const snap = (data: unknown) => ({
  exists: () => Boolean(data),
  data: () => data,
})
beforeEach(() => {
  vi.clearAllMocks()
  m.watch.mockReturnValue(m.stop)
  m.get.mockResolvedValue(snap(null))
  m.list.mockResolvedValue({ size: 0, docs: [] })
})
it('0円作成と版/作成時刻照合による更新・解除、通信断の拒否', async () => {
  await saveBudget('h', 'a', '2026-10', null, 0, null)
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    amount: 0,
    version: 1,
    createdAt: 'server',
    createdBy: 'a',
  })
  m.get.mockResolvedValue(snap(budget))
  await saveBudget('h', 'b', '2026-10', null, 200, budget)
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    amount: 200,
    version: 2,
    createdBy: 'a',
    updatedBy: 'b',
  })
  await removeBudget('h', budget)
  expect(m.delete).toHaveBeenCalledOnce()
  for (const current of [
    { ...budget, version: 2 },
    { ...budget, createdAt: { toMillis: () => 2 } },
    null,
  ]) {
    m.get.mockResolvedValue(snap(current))
    await expect(
      saveBudget('h', 'a', '2026-10', null, 5, budget),
    ).rejects.toMatchObject({ code: 'finance-conflict' })
    await expect(removeBudget('h', budget)).rejects.toMatchObject({
      code: 'finance-conflict',
    })
  }
  vi.stubGlobal('navigator', { onLine: false })
  await expect(
    saveBudget('h', 'a', '2026-10', null, 5, null),
  ).rejects.toMatchObject({ code: 'offline' })
  vi.unstubAllGlobals()
})
it('コピーは未設定のみ、アーカイブを除外し、部分失敗を報告して再実行可能', async () => {
  const source = [
    { ...budget, id: '2026-09__total', month: '2026-09', amount: 0 },
    {
      ...budget,
      id: '2026-09__category__food',
      month: '2026-09',
      categoryId: 'food',
      scope: 'category',
    },
    {
      ...budget,
      id: '2026-09__category__old',
      month: '2026-09',
      categoryId: 'old',
      scope: 'category',
    },
  ]
  m.list.mockResolvedValue({
    size: 3,
    docs: source.map((item) => ({ id: item.id, data: () => item })),
  })
  const stored = new Map<string, unknown>(
    source.map((item) => [`households/h/budgets/${item.id}`, item]),
  )
  stored.set('households/h/financeCategories/food', {
    type: 'expense',
    archived: false,
  })
  stored.set('households/h/financeCategories/old', {
    type: 'expense',
    archived: true,
  })
  let fail = true
  m.get.mockImplementation(async (path: string) => {
    if (path.endsWith('2026-10__category__food') && fail) throw Error('network')
    return snap(stored.get(path))
  })
  m.set.mockImplementation((path: string, data: unknown) =>
    stored.set(path, data),
  )
  expect(await copyPreviousBudgets('h', 'a', '2026-10')).toEqual({
    copied: 1,
    skipped: 1,
    failed: 1,
  })
  fail = false
  expect(await copyPreviousBudgets('h', 'a', '2026-10')).toEqual({
    copied: 1,
    skipped: 2,
    failed: 0,
  })
  expect(
    (stored.get('households/h/budgets/2026-10__total') as { amount: number })
      .amount,
  ).toBe(0)
})
it('予算は月条件と上限付きで取得し、解除後の通知を破棄する', async () => {
  const next = vi.fn(),
    error = vi.fn()
  const stop = watchBudgets('h', '2026-10', next, error)
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledOnce())
  expect(m.watch.mock.lastCall?.[0]).toContainEqual(['month', '==', '2026-10'])
  const cb = m.watch.mock.lastCall![2] as (s: unknown) => void
  cb({
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: [],
    size: 0,
  })
  expect(next).toHaveBeenCalledWith([], true)
  stop()
  cb({
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: [],
    size: 0,
  })
  expect(next).toHaveBeenCalledOnce()
})

it('前月未設定は変更せず、取得上限でコピーを中断する', async () => {
  expect(await copyPreviousBudgets('h', 'a', '2026-10')).toEqual({
    copied: 0,
    skipped: 0,
    failed: 0,
  })
  expect(m.set).not.toHaveBeenCalled()
  m.list.mockResolvedValue({ size: 102, docs: [] })
  await expect(copyPreviousBudgets('h', 'a', '2026-10')).rejects.toThrow(
    '取得上限',
  )
  expect(m.set).not.toHaveBeenCalled()
})
it('ホームは月全体文書だけを購読し、月予算の未設定と取得上限を区別する', async () => {
  const next = vi.fn(),
    error = vi.fn()
  const stop = watchBudgets('h', '2026-10', next, error, true)
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledOnce())
  expect(m.watch.mock.lastCall?.[0]).toBe('households/h/budgets/2026-10__total')
  const cb = m.watch.mock.lastCall![2] as (s: unknown) => void
  cb({
    metadata: { fromCache: true, hasPendingWrites: false },
    exists: () => false,
  })
  expect(next).not.toHaveBeenCalled()
  cb({
    metadata: { fromCache: false, hasPendingWrites: false },
    exists: () => false,
  })
  expect(next).toHaveBeenLastCalledWith([], true)
  stop()
  const publish = vi.fn()
  watchBudgets('h', '2026-10', publish, error)
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledTimes(2))
  const list = m.watch.mock.lastCall![2] as (s: unknown) => void
  list({
    metadata: { fromCache: false, hasPendingWrites: false },
    size: 102,
    docs: Array.from({ length: 102 }, (_, i) => ({
      id: String(i),
      data: () => budget,
    })),
  })
  expect(publish.mock.lastCall?.[0]).toHaveLength(101)
  expect(publish.mock.lastCall?.[1]).toBe(false)
})
