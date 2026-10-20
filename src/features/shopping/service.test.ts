import { beforeEach, expect, it, vi } from 'vitest'
import {
  createShopping,
  changeShopping,
  removeShopping,
  watchShopping,
} from './service'
import type { ShoppingItem } from './model'
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
const item: ShoppingItem = {
  id: 's',
  title: '牛乳',
  category: 'food',
  quantity: '2',
  unit: '本',
  budget: 500,
  priority: 3,
  assigneeIds: ['a'],
  purchased: false,
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
it('作成は正規化/監査/初期状態、変更は版を照合し購入と解除を保存する', async () => {
  m.get.mockResolvedValueOnce(snap(null))
  await createShopping('h', 'a', { ...item, quantity: '2.000' }, ['a', 'b'])
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    quantity: '2',
    purchased: false,
    version: 1,
    createdAt: 'server',
    updatedBy: 'a',
  })
  await changeShopping('h', 'b', item, { purchased: true }, ['a', 'b'])
  expect(m.update.mock.lastCall?.[1]).toMatchObject({
    purchased: true,
    version: 2,
    updatedBy: 'b',
    updatedAt: 'server',
  })
  expect(m.update.mock.lastCall?.[1]).not.toHaveProperty('createdAt')
  await changeShopping(
    'h',
    'a',
    { ...item, purchased: true },
    { purchased: false },
    ['a', 'b'],
  )
  expect(m.update.mock.lastCall?.[1].purchased).toBe(false)
})
it('古い版/削除済みの編集と削除を拒否し、オンライン時だけ書き込む', async () => {
  for (const data of [null, { ...item, version: 2 }]) {
    m.get.mockResolvedValueOnce(snap(data))
    await expect(
      changeShopping('h', 'a', item, { title: '変更' }, ['a']),
    ).rejects.toMatchObject({ code: 'shopping-conflict' })
    m.get.mockResolvedValueOnce(snap(data))
    await expect(removeShopping('h', 'a', item)).rejects.toMatchObject({
      code: 'shopping-conflict',
    })
  }
  expect(m.update).not.toHaveBeenCalled()
  expect(m.delete).not.toHaveBeenCalled()
  await removeShopping('h', 'a', item)
  expect(m.delete).toHaveBeenCalledOnce()
  vi.stubGlobal('navigator', { onLine: false })
  await expect(createShopping('h', 'a', item, ['a'])).rejects.toMatchObject({
    code: 'offline',
  })
  vi.unstubAllGlobals()
})
it('未購入の優先順とカテゴリはサーバー条件、ホームは6件取得で5件だけ表示', async () => {
  let publish: (s: unknown) => void = () => {}
  m.watch.mockImplementation(
    (_q: unknown, _o: unknown, next: typeof publish) => {
      publish = next
      return m.stop
    },
  )
  const next = vi.fn(),
    error = vi.fn(),
    stop = watchShopping(
      'h',
      { purchased: false, count: 5, category: 'food' },
      next,
      error,
    )
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledOnce())
  expect(m.watch.mock.lastCall?.[0]).toEqual(
    expect.arrayContaining([
      ['purchased', '==', false],
      ['category', '==', 'food'],
      ['priority', 'desc'],
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
  watchShopping('h', { purchased: true, count: 100 }, vi.fn(), error)
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledTimes(2))
  expect(m.watch.mock.lastCall?.[0]).toContainEqual(['updatedAt', 'desc'])
})
