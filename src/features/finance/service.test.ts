import { beforeEach, expect, it, vi } from 'vitest'
import { watchFinanceEntries } from './service'

const m = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn() }))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  doc: (...parts: unknown[]) => parts.join('/'),
  where: (...parts: unknown[]) => parts,
  orderBy: (...parts: unknown[]) => parts,
  limit: (value: number) => value,
  query: (...parts: unknown[]) => parts,
  onSnapshot: m.listen,
  runTransaction: vi.fn(),
  serverTimestamp: () => 'server',
}))

beforeEach(() => {
  vi.clearAllMocks()
  m.listen.mockReturnValue(m.stop)
})

it('購読更新ごとに新しい明細配列を返し、以前のスナップショットを変更しない', async () => {
  const listeners: Array<{
    collection: string
    next: (snapshot: unknown) => void
  }> = []
  m.listen.mockImplementation(
    (q: unknown[], _options: unknown, next: (snapshot: unknown) => void) => {
      const collection = q.find(
        (part): part is { path: string } =>
          part !== null && typeof part === 'object' && 'path' in part,
      )!
      listeners.push({ collection: collection.path, next })
      return m.stop
    },
  )
  const publish = vi.fn()
  watchFinanceEntries('home', { month: '2026-10' }, publish, vi.fn())
  await vi.waitFor(() => expect(listeners).toHaveLength(2))
  const expenses = listeners.find((item) =>
    item.collection.endsWith('/expenses'),
  )!
  const snapshot = (amount: number) => ({
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: [
      {
        id: 'expense-1',
        data: () => ({
          title: '食材',
          amount,
          date: '2026-10-21',
          categoryId: 'food',
          memo: '',
          version: 1,
          createdAt: { toMillis: () => 1 },
          createdBy: 'user-a',
          updatedAt: { toMillis: () => 1 },
          updatedBy: 'user-a',
        }),
      },
    ],
  })

  listeners
    .find((item) => item.collection.endsWith('/incomes'))!
    .next({ metadata: { fromCache: false, hasPendingWrites: false }, docs: [] })
  expenses.next(snapshot(100))
  const previousEntries = publish.mock.lastCall![0] as Array<{ amount: number }>
  expect(previousEntries[0]!.amount).toBe(100)

  expenses.next(snapshot(250))
  const currentEntries = publish.mock.lastCall![0] as Array<{ amount: number }>
  expect(currentEntries).not.toBe(previousEntries)
  expect(previousEntries[0]!.amount).toBe(100)
  expect(currentEntries[0]!.amount).toBe(250)
})

it('両方の購読が揃うまで合計を通知せず、一方が失敗したら残りの更新でも成功に戻さない', async () => {
  const callbacks: Array<{ next: (s: unknown) => void; fail: () => void }> = []
  m.listen.mockImplementation(
    (
      _q: unknown,
      _o: unknown,
      next: (s: unknown) => void,
      fail: () => void,
    ) => {
      callbacks.push({ next, fail })
      return m.stop
    },
  )
  const next = vi.fn(),
    fail = vi.fn()
  watchFinanceEntries('home', { month: '2026-10' }, next, fail)
  await vi.waitFor(() => expect(callbacks).toHaveLength(2))
  const empty = {
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: [],
  }
  callbacks[0]!.next(empty)
  expect(next).not.toHaveBeenCalled()
  callbacks[1]!.next(empty)
  expect(next).toHaveBeenCalledOnce()
  callbacks[0]!.fail()
  callbacks[1]!.next(empty)
  expect(fail).toHaveBeenCalledOnce()
  expect(next).toHaveBeenCalledOnce()
})
