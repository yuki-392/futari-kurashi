import { beforeEach, expect, it, vi } from 'vitest'
import {
  createRecurring,
  editRecurring,
  setRecurringActive,
  completeRecurring,
  undoRecurring,
  watchRecurring,
} from './service'
import type { Recurring, Completion } from './model'
const m = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
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
const r: Recurring = {
  id: 'r',
  title: '掃除',
  assigneeIds: ['a'],
  priority: 'medium',
  frequency: 'weekly',
  startDate: '2026-10-19',
  nextDueDate: '2026-10-19',
  active: true,
  version: 1,
  lastCompletionId: null,
  lastAction: 'create',
  createdAt: null,
  updatedAt: null,
  createdBy: 'a',
  updatedBy: 'a',
}
const snap = (data: unknown) => ({ exists: () => !!data, data: () => data })
beforeEach(() => {
  vi.clearAllMocks()
  m.get.mockResolvedValue(snap(r))
  m.watch.mockReturnValue(m.stop)
})
it('作成・編集・停止再開は版と監査を保ち、編集や停止で取消参照を消す', async () => {
  m.get.mockResolvedValueOnce(snap(null))
  await createRecurring('h', 'a', r, ['a'])
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    active: true,
    version: 1,
    lastCompletionId: null,
    lastAction: 'create',
    createdAt: 'server',
  })
  await editRecurring('h', 'a', r, { ...r, title: '変更' }, ['a'])
  expect(m.update.mock.lastCall?.[1]).toMatchObject({
    title: '変更',
    version: 2,
    lastCompletionId: null,
  })
  await setRecurringActive('h', 'a', r, false)
  expect(m.update.mock.lastCall?.[1]).toMatchObject({
    active: false,
    version: 2,
    lastCompletionId: null,
  })
})
it('完了は履歴作成と予定更新をまとめ、古い版と停止中を拒否する', async () => {
  m.get.mockResolvedValueOnce(snap({ ...r, version: 2 }))
  await expect(completeRecurring('h', 'a', r)).rejects.toMatchObject({
    code: 'recurring-conflict',
  })
  expect(m.set).not.toHaveBeenCalled()
  m.get.mockResolvedValueOnce(snap({ ...r, active: false }))
  await expect(
    completeRecurring('h', 'a', { ...r, active: false }),
  ).rejects.toMatchObject({ code: 'recurring-conflict' })
  await completeRecurring('h', 'a', r)
  expect(m.set.mock.lastCall?.[0]).toContain('r_2')
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    scheduleId: 'r',
    scheduleVersion: 2,
    scheduledDate: r.nextDueDate,
    completedBy: 'a',
    completedAt: 'server',
    cancelledAt: null,
  })
  expect(m.update.mock.lastCall?.[1]).toMatchObject({
    version: 2,
    lastCompletionId: 'r_2',
    updatedAt: 'server',
  })
})
it('取消は直近版だけを戻し、履歴へ取消記録を残して過去参照を消す', async () => {
  const history = {
    id: 'r_2',
    scheduleId: 'r',
    scheduleVersion: 2,
    scheduledDate: '2026-10-19',
    nextDueDate: '2026-10-26',
    cancelledAt: null,
  } as Completion
  m.get
    .mockResolvedValueOnce(
      snap({
        ...r,
        version: 2,
        nextDueDate: '2026-10-26',
        lastCompletionId: 'r_2',
      }),
    )
    .mockResolvedValueOnce(snap(history))
  await undoRecurring('h', 'b', history)
  expect(m.update.mock.calls).toEqual(
    expect.arrayContaining([
      [
        expect.anything(),
        expect.objectContaining({ cancelledBy: 'b', cancelledAt: 'server' }),
      ],
      [
        expect.anything(),
        expect.objectContaining({
          nextDueDate: '2026-10-19',
          lastCompletionId: null,
          version: 3,
        }),
      ],
    ]),
  )
  m.get
    .mockResolvedValueOnce(snap({ ...r, version: 3, lastCompletionId: null }))
    .mockResolvedValueOnce(snap(history))
  await expect(undoRecurring('h', 'b', history)).rejects.toMatchObject({
    code: 'recurring-conflict',
  })
})
it('購読は有限でホーム条件が独立し、解除後・キャッシュ・保留中結果を無視する', async () => {
  let publish: (s: unknown) => void = () => {}
  m.watch.mockImplementation(
    (_q: unknown, _o: unknown, next: typeof publish) => {
      publish = next
      return m.stop
    },
  )
  const next = vi.fn(),
    error = vi.fn()
  const stop = watchRecurring(
    'h',
    { kind: 'today', count: 10, today: '2026-10-20' },
    next,
    error,
  )
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledOnce())
  expect(m.watch.mock.lastCall?.[0]).toContainEqual(['active', '==', true])
  expect(m.watch.mock.lastCall?.[0]).toContainEqual([
    'nextDueDate',
    '<=',
    '2026-10-20',
  ])
  expect(m.watch.mock.lastCall?.[0]).toContain(11)
  publish({ metadata: { fromCache: true }, docs: [] })
  expect(next).not.toHaveBeenCalled()
  publish({
    metadata: { fromCache: false, hasPendingWrites: false },
    docs: [{ id: 'r', data: () => r }],
  })
  expect(next).toHaveBeenCalledOnce()
  stop()
  publish({ metadata: {}, docs: [] })
  expect(next).toHaveBeenCalledOnce()
  expect(m.stop).toHaveBeenCalledOnce()
})

it('履歴の取消可否を定義ごとに1購読で確認し、画面を離れたら解除する', async () => {
  const { watchUndoTargets } = await import('./service')
  const callbacks: ((s: unknown) => void)[] = []
  m.watch.mockImplementation(
    (_q: unknown, _o: unknown, next: (s: unknown) => void) => {
      callbacks.push(next)
      return m.stop
    },
  )
  const next = vi.fn(),
    stop = watchUndoTargets('h', ['r', 'r', 's'], next)
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledTimes(2))
  callbacks[0]?.({
    exists: () => true,
    data: () => r,
    metadata: { fromCache: false, hasPendingWrites: false },
  })
  expect(next.mock.lastCall?.[0].r.id).toBe('r')
  stop()
  expect(m.stop).toHaveBeenCalledTimes(2)
  callbacks[1]?.({ exists: () => true, data: () => r, metadata: {} })
  expect(next).toHaveBeenCalledOnce()
})

it('交代完了は担当から相手へ、履歴は元担当、取消で元担当へ復元する', async () => {
  const rotating = {
    ...r,
    taskType: 'cleaning',
    place: '台所',
    rotation: 'alternate',
  } as Recurring
  m.get
    .mockResolvedValueOnce(snap(rotating))
    .mockResolvedValueOnce(snap({ memberIds: ['a', 'b'] }))
  await completeRecurring('h', 'b', rotating)
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    assigneeIds: ['a'],
    place: '台所',
    rotation: 'alternate',
    completedBy: 'b',
  })
  expect(m.update.mock.lastCall?.[1]).toMatchObject({ assigneeIds: ['b'] })
  const hist = {
    ...rotating,
    id: 'r_2',
    scheduleId: 'r',
    scheduleVersion: 2,
    scheduledDate: r.nextDueDate,
    cancelledAt: null,
  } as unknown as Completion
  m.get
    .mockResolvedValueOnce(
      snap({
        ...rotating,
        assigneeIds: ['b'],
        version: 2,
        lastCompletionId: 'r_2',
      }),
    )
    .mockResolvedValueOnce(snap(hist))
  await undoRecurring('h', 'a', hist)
  expect(m.update.mock.lastCall?.[1]).toMatchObject({
    assigneeIds: ['a'],
    nextDueDate: r.nextDueDate,
  })
})
it('掃除購読は場所をサーバー条件に含め有限取得する', async () => {
  const stop = watchRecurring(
    'h',
    { kind: 'cleaning', end: '2026-10-25', place: '台所', count: 100 },
    vi.fn(),
    vi.fn(),
  )
  await vi.waitFor(() => expect(m.watch).toHaveBeenCalledOnce())
  expect(m.watch.mock.lastCall?.[0]).toEqual(
    expect.arrayContaining([
      ['taskType', '==', 'cleaning'],
      ['place', '==', '台所'],
      ['nextDueDate', '<=', '2026-10-25'],
      ['active', '==', true],
      101,
    ]),
  )
  stop()
})

it('旧定義の完了でも新しい履歴には一般/場所なし/固定を明示して保存する', async () => {
  await completeRecurring('h', 'a', r)
  expect(m.set.mock.lastCall?.[1]).toMatchObject({
    taskType: 'general',
    place: '',
    rotation: 'fixed',
    assigneeIds: ['a'],
  })
})
