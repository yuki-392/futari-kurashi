import { beforeEach, expect, it, vi } from 'vitest'
import {
  createDeclutter,
  changeDeclutter,
  removeDeclutter,
  watchDeclutter,
} from './service'
import type { DeclutterItem } from './model'
const m = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  watch: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_d: unknown, ...p: string[]) => p.join('/'),
  doc: (...p: unknown[]) => p.join('/'),
  where: (...p: unknown[]) => p,
  orderBy: (...p: unknown[]) => p,
  limit: (n: number) => n,
  query: (...p: unknown[]) => p,
  serverTimestamp: () => 'server',
  onSnapshot: m.watch,
  runTransaction: async (_d: unknown, cb: (tx: typeof m) => unknown) => cb(m),
}))
const item: DeclutterItem = {
  id: 'd',
  title: '古い服',
  method: 'sell',
  ownerIds: ['a'],
  dueDate: '2026-10-20',
  sortDueDate: '2026-10-20',
  completed: false,
  completedAt: null,
  completedBy: null,
  version: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: 'a',
  updatedBy: 'a',
}
const snap = (value: unknown) => ({ exists: () => !!value, data: () => value })
beforeEach(() => {
  vi.clearAllMocks()
  m.get.mockResolvedValue(snap(item))
  m.watch.mockReturnValue(m.stop)
})
it('作成は期限ソート/完了null/監査を保存し、完了と解除を原子的に更新する', async () => {
  m.get.mockResolvedValueOnce(snap(null))
  await createDeclutter('h', 'a', { ...item, dueDate: null }, ['a', 'b'])
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    sortDueDate: '~',
    completed: false,
    completedAt: null,
    completedBy: null,
    version: 1,
    createdAt: 'server',
    updatedBy: 'a',
  })
  await changeDeclutter('h', 'b', item, { completed: true }, ['a', 'b'])
  const completed = { ...item, ...m.update.mock.lastCall?.[1] }
  expect(completed).toMatchObject({
    completed: true,
    completedAt: 'server',
    completedBy: 'b',
    version: 2,
    updatedBy: 'b',
  })
  expect(m.update.mock.lastCall?.[1]).not.toHaveProperty('createdAt')
  m.get.mockResolvedValueOnce(snap(completed))
  await changeDeclutter('h', 'a', completed, { title: '編集', dueDate: null }, [
    'a',
    'b',
  ])
  expect(m.update.mock.lastCall?.[1]).toMatchObject({
    sortDueDate: '~',
    completedAt: 'server',
    completedBy: 'b',
    version: 3,
  })
  m.get.mockResolvedValueOnce(snap(completed))
  await changeDeclutter('h', 'a', completed, { completed: false }, ['a', 'b'])
  expect(m.update.mock.lastCall?.[1]).toMatchObject({
    completed: false,
    completedAt: null,
    completedBy: null,
  })
})
it('保留の完了と処分済みの保留への編集はサービスでも拒否する', async () => {
  m.get.mockResolvedValueOnce(snap({ ...item, method: 'hold' }))
  await expect(
    changeDeclutter('h', 'a', item, { completed: true }, ['a']),
  ).rejects.toThrow('処分方法')
  const completed = {
    ...item,
    completed: true,
    completedAt: 'before',
    completedBy: 'b',
  }
  m.get.mockResolvedValueOnce(snap(completed))
  await expect(
    changeDeclutter('h', 'a', completed, { method: 'hold' }, ['a']),
  ).rejects.toThrow('未処分')
  expect(m.update).not.toHaveBeenCalled()
})
it('古い版/削除済みの編集と削除を拒否し、オンライン時だけ書き込む', async () => {
  for (const data of [null, { ...item, version: 2 }]) {
    m.get.mockResolvedValueOnce(snap(data))
    await expect(
      changeDeclutter('h', 'a', item, { title: '変更' }, ['a']),
    ).rejects.toMatchObject({ code: 'declutter-conflict' })
    m.get.mockResolvedValueOnce(snap(data))
    await expect(removeDeclutter('h', 'a', item)).rejects.toMatchObject({
      code: 'declutter-conflict',
    })
  }
  expect(m.update).not.toHaveBeenCalled()
  expect(m.delete).not.toHaveBeenCalled()
  await removeDeclutter('h', 'a', item)
  expect(m.delete).toHaveBeenCalledOnce()
  vi.stubGlobal('navigator', { onLine: false })
  await expect(createDeclutter('h', 'a', item, ['a'])).rejects.toMatchObject({
    code: 'offline',
  })
  vi.unstubAllGlobals()
})
it('未処分の期限順と方法はサーバー条件、ホームは今日以前6件取得で5件だけ表示', async () => {
  let publish: (s: unknown) => void = () => {}
  m.watch.mockImplementation(
    (_q: unknown, _o: unknown, next: typeof publish) => {
      publish = next
      return m.stop
    },
  )
  const next = vi.fn(),
    error = vi.fn(),
    stop = watchDeclutter(
      'h',
      { completed: false, count: 5, method: 'hold', through: '2026-10-20' },
      next,
      error,
    )
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledOnce())
  expect(m.watch.mock.lastCall?.[0]).toEqual(
    expect.arrayContaining([
      ['completed', '==', false],
      ['method', '==', 'hold'],
      ['sortDueDate', '<=', '2026-10-20'],
      ['sortDueDate', 'asc'],
      ['createdAt', 'desc'],
      6,
    ]),
  )
  publish({ metadata: { fromCache: true }, docs: [] })
  expect(next).not.toHaveBeenCalled()
  publish({
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      data: () => item,
    })),
  })
  expect(next.mock.lastCall?.[0]).toHaveLength(5)
  expect(next.mock.lastCall?.[1]).toBe(true)
  stop()
  publish({ metadata: {}, docs: [] })
  expect(next).toHaveBeenCalledOnce()
  expect(m.stop).toHaveBeenCalledOnce()
  watchDeclutter('h', { completed: true, count: 100 }, vi.fn(), error)
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledTimes(2))
  expect(m.watch.mock.lastCall?.[0]).toContainEqual(['completedAt', 'desc'])
})
