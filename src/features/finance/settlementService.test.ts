import { beforeEach, expect, it, vi } from 'vitest'
import {
  recordSettlementPayment,
  cancelSettlementPayment,
  watchSettlements,
  prepareExpenseMonths,
} from './settlementService'
const m = vi.hoisted(() => ({
  data: new Map<string, Record<string, unknown>>(),
  writes: [] as unknown[],
  listen: vi.fn(),
  stop: vi.fn(),
  sync: vi.fn(),
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...p: string[]) => p.join('/'),
  doc: (...p: unknown[]) =>
    typeof p[0] === 'string' ? `${p[0]}/new-payment` : p.slice(1).join('/'),
  serverTimestamp: () => 'server',
  where: (...p: unknown[]) => p,
  limit: (n: number) => n,
  query: (...p: unknown[]) => p,
  onSnapshot: m.listen,
  onSnapshotsInSync: m.sync,
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) =>
    fn({
      get: async (ref: string) => ({
        exists: () => m.data.has(ref),
        data: () => m.data.get(ref),
      }),
      set: (...args: unknown[]) => m.writes.push(args),
      update: (...args: unknown[]) => m.writes.push(args),
    }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  m.data.clear()
  m.writes = []
  m.data.set('households/h', { ownerId: 'a', memberIds: ['a', 'b'] })
  m.data.set('households/h/settlementMonths/2026-10', {
    month: '2026-10',
    netPaid: 0,
    version: 2,
    createdAt: 'created',
    createdBy: 'a',
  })
  m.listen.mockReturnValue(m.stop)
})
const input = {
  month: '2026-10',
  fromUid: 'b',
  toUid: 'a',
  amount: 50,
  date: '2026-11-01',
}
it('rejects stale month without writing and permits retry only after refresh', async () => {
  await expect(
    recordSettlementPayment('h', 'a', input, 1),
  ).rejects.toMatchObject({ code: 'finance-conflict' })
  expect(m.writes).toHaveLength(0)
  await recordSettlementPayment('h', 'b', input, 2)
  expect(m.writes).toHaveLength(2)
  expect(m.writes[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ amount: 50, createdBy: 'b', canceledAt: null }),
    ]),
  )
  expect(m.writes[1]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ netPaid: 50, version: 3 }),
    ]),
  )
})
it('cancellation retains original payment data and reverses ledger atomically', async () => {
  const p = {
    id: 'p',
    ...input,
    version: 1,
    canceledAt: null,
    canceledBy: null,
    createdAt: 'c',
    createdBy: 'b',
    updatedAt: 'c',
    updatedBy: 'b',
  }
  m.data.set('households/h/settlementPayments/p', p)
  await cancelSettlementPayment('h', 'a', p, 2)
  expect(m.writes).toHaveLength(2)
  expect(m.writes[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        version: 2,
        canceledBy: 'a',
        canceledAt: 'server',
      }),
    ]),
  )
  expect(m.writes[1]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ netPaid: -50, version: 3 }),
    ]),
  )
  m.data.set('households/h/settlementPayments/p', {
    ...p,
    version: 2,
    canceledAt: 'server',
  })
  m.writes = []
  await expect(cancelSettlementPayment('h', 'a', p, 2)).rejects.toMatchObject({
    code: 'finance-conflict',
  })
  expect(m.writes).toHaveLength(0)
})
it('waits for every server subscription and never recovers an error using another stream', async () => {
  const callbacks: { next: (v: unknown) => void; fail: () => void }[] = []
  m.listen.mockImplementation(
    (
      _q: unknown,
      _o: unknown,
      next: (v: unknown) => void,
      fail: () => void,
    ) => {
      callbacks.push({ next, fail })
      return m.stop
    },
  )
  let flush = () => {}
  m.sync.mockImplementation((_db: unknown, fn: () => void) => {
    flush = fn
    return m.stop
  })
  const next = vi.fn(),
    fail = vi.fn()
  const stop = watchSettlements('h', '2026-10', next, fail)
  await vi.waitFor(() => expect(callbacks).toHaveLength(3))
  const snapshot = {
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: [],
  }
  callbacks[0]!.next(snapshot)
  callbacks[1]!.next(snapshot)
  expect(next).not.toHaveBeenCalled()
  callbacks[2]!.next(snapshot)
  expect(next).not.toHaveBeenCalled()
  flush()
  expect(next).toHaveBeenCalledOnce()
  callbacks[0]!.fail()
  callbacks[1]!.next(snapshot)
  expect(fail).toHaveBeenCalledOnce()
  expect(next).toHaveBeenCalledOnce()
  stop()
  expect(m.stop).toHaveBeenCalledTimes(4)
})

it('locks both months before writes when moving a shared expense and never changes net paid', async () => {
  const order: string[] = []
  const tx = {
    get: async (ref: string) => {
      order.push('read')
      return { data: () => m.data.get(ref) }
    },
    set: (_ref: unknown, data: unknown) => {
      order.push('write')
      m.writes.push(data)
    },
  }
  const before = {
    type: 'expense' as const,
    title: 'x',
    amount: 100,
    date: '2026-10-01',
    categoryId: 'food',
    memo: '',
    sharing: { payerId: 'a', shares: { a: 50, b: 50 } },
  }
  const write = await prepareExpenseMonths(
    tx as unknown as Parameters<typeof prepareExpenseMonths>[0],
    {} as Parameters<typeof prepareExpenseMonths>[1],
    'h',
    'a',
    'e',
    before,
    { ...before, date: '2026-11-01' },
  )
  expect(order.every((v) => v === 'read')).toBe(true)
  write()
  expect(order.slice(-2)).toEqual(['write', 'write'])
  expect(m.writes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ month: '2026-10', version: 3, netPaid: 0 }),
      expect.objectContaining({ month: '2026-11', version: 1, netPaid: 0 }),
    ]),
  )
})

it('rejects a cancellation that would exceed the signed monthly bound before writing', async () => {
  const p = {
    id: 'p',
    ...input,
    version: 1,
    canceledAt: null,
    canceledBy: null,
    createdAt: 'c',
    createdBy: 'b',
    updatedAt: 'c',
    updatedBy: 'b',
  }
  m.data.set('households/h/settlementPayments/p', p)
  m.data.set('households/h/settlementMonths/2026-10', {
    month: '2026-10',
    netPaid: -999999999999999,
    version: 2,
  })
  await expect(cancelSettlementPayment('h', 'a', p, 2)).rejects.toThrow('上限')
  expect(m.writes).toHaveLength(0)
})
