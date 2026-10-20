import { expect, it, vi, beforeEach } from 'vitest'
import { createTask, changeTask, removeTask, watchTasks } from './service'
const mock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  snapshot: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...p: string[]) => p.join('/'),
  doc: (...a: unknown[]) => a.join('/'),
  serverTimestamp: () => 'server-time',
  where: (...v: unknown[]) => v,
  orderBy: (...v: unknown[]) => v,
  limit: (n: number) => n,
  query: (...v: unknown[]) => v,
  onSnapshot: mock.snapshot,
  runTransaction: async (
    _db: unknown,
    callback: (tx: typeof mock) => unknown,
  ) => callback(mock),
}))
const task = {
  id: 't',
  title: '洗濯',
  assigneeIds: ['a'],
  dueDate: null,
  priority: 'medium' as const,
  completed: false,
  version: 1,
  createdBy: 'a',
  updatedBy: 'a',
  createdAt: null,
  updatedAt: null,
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.get.mockResolvedValue({ exists: () => true, data: () => task })
  mock.snapshot.mockReturnValue(mock.stop)
})
it('更新・削除はサーバーの版を照合し、競合と削除済みを変更しない', async () => {
  mock.get.mockResolvedValueOnce({
    exists: () => true,
    data: () => ({ ...task, version: 2 }),
  })
  await expect(
    changeTask('h', 'a', task, { title: '新しい' }, ['a']),
  ).rejects.toMatchObject({ code: 'task-conflict' })
  expect(mock.update).not.toHaveBeenCalled()
  mock.get.mockResolvedValueOnce({ exists: () => false })
  await expect(removeTask('h', 'a', task)).rejects.toMatchObject({
    code: 'task-conflict',
  })
  expect(mock.delete).not.toHaveBeenCalled()
  await changeTask('h', 'a', task, { completed: true }, ['a'])
  expect(mock.update.mock.lastCall?.[1]).toMatchObject({
    version: 2,
    completed: true,
    updatedBy: 'a',
    updatedAt: 'server-time',
  })
  await removeTask('h', 'a', task)
  expect(mock.delete).toHaveBeenCalledOnce()
})
it('作成もオンラインtransactionを使い、監査情報と初期版を保存する', async () => {
  mock.get.mockResolvedValueOnce({ exists: () => false })
  await createTask('h', 'a', task, ['a'])
  expect(mock.get).toHaveBeenCalledOnce()
  expect(mock.set.mock.lastCall?.[1]).toMatchObject({
    version: 1,
    completed: false,
    createdBy: 'a',
    updatedBy: 'a',
    createdAt: 'server-time',
    updatedAt: 'server-time',
  })
})
it('有限クエリを作り、保留中の書き込み・キャッシュ結果・解除後のイベントを表示しない', async () => {
  let next: (s: unknown) => void = () => {}
  mock.snapshot.mockImplementation(
    (_q: unknown, _o: unknown, n: typeof next) => {
      next = n
      return mock.stop
    },
  )
  const value = vi.fn(),
    error = vi.fn()
  const stop = watchTasks(
    'h',
    { completed: false, dueDate: '2026-10-20', count: 10 },
    value,
    error,
  )
  await vi.waitFor(() => expect(mock.snapshot).toHaveBeenCalledOnce())
  expect(mock.snapshot.mock.calls[0]?.[0]).toContainEqual([
    'dueDate',
    '==',
    '2026-10-20',
  ])
  expect(mock.snapshot.mock.calls[0]?.[0]).toContain(11)
  next({ metadata: { hasPendingWrites: true, fromCache: false }, docs: [] })
  next({ metadata: { hasPendingWrites: false, fromCache: true }, docs: [] })
  expect(value).not.toHaveBeenCalled()
  next({
    metadata: { hasPendingWrites: false, fromCache: false },
    docs: Array.from({ length: 11 }, (_, i) => ({
      id: String(i),
      data: () => task,
    })),
  })
  expect(value.mock.lastCall?.[0]).toHaveLength(10)
  expect(value.mock.lastCall?.[1]).toBe(true)
  stop()
  expect(mock.stop).toHaveBeenCalledOnce()
  next({ metadata: { hasPendingWrites: false, fromCache: false }, docs: [] })
  expect(value).toHaveBeenCalledOnce()
})
