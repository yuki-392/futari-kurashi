// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  HouseholdContext,
  type HouseholdContextValue,
} from '../household/context'
import { RecurringPanel, HistoryPanel, TodayRecurring } from './RecurringPanels'
import { ChoresPanel } from './ChoresPanel'
import type { Recurring, Completion } from './model'
const m = vi.hoisted(() => ({
  watch: vi.fn(),
  stop: vi.fn(),
  create: vi.fn(),
  edit: vi.fn(),
  active: vi.fn(),
  complete: vi.fn(),
  undo: vi.fn(),
  targets: vi.fn(),
}))
vi.mock('./service', () => ({
  watchRecurring: m.watch,
  watchUndoTargets: m.targets,
  createRecurring: m.create,
  editRecurring: m.edit,
  setRecurringActive: m.active,
  completeRecurring: m.complete,
  undoRecurring: m.undo,
}))
vi.mock('../tasks/TasksPanel', () => ({ TasksPanel: () => <p>通常ToDo</p> }))
const home: HouseholdContextValue = {
  status: 'joined',
  uid: 'a',
  email: 'a@example.test',
  household: {
    id: 'h',
    name: 'テスト世帯',
    ownerId: 'a',
    memberIds: ['a', 'b'],
    activeInviteId: null,
  },
  create: vi.fn(),
  issue: vi.fn(),
  cancel: vi.fn(),
  inspect: vi.fn(),
  join: vi.fn(),
  retry: vi.fn(),
}
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
const entry: Completion = {
  id: 'r_2',
  scheduleId: 'r',
  scheduleVersion: 2,
  title: '掃除',
  assigneeIds: ['a'],
  priority: 'medium',
  frequency: 'weekly',
  startDate: '2026-10-19',
  scheduledDate: '2026-10-19',
  nextDueDate: '2026-10-26',
  completedAt: null,
  completedBy: 'b',
  cancelledAt: null,
  cancelledBy: null,
}
let publish: (items: (Recurring | Completion)[], more: boolean) => void,
  fail: () => void
const ui = (node: React.ReactNode) => (
  <HouseholdContext.Provider value={home}>{node}</HouseholdContext.Provider>
)
beforeEach(() => {
  m.watch.mockImplementation((_h, _q, next, error) => {
    publish = next
    fail = error
    return m.stop
  })
  m.targets.mockImplementation((_h, _ids, next) => {
    next({ r: { ...r, version: 2, lastCompletionId: 'r_2' } })
    return m.stop
  })
  m.create.mockResolvedValue(undefined)
  m.edit.mockResolvedValue(undefined)
  m.active.mockResolvedValue(undefined)
  m.complete.mockResolvedValue(undefined)
  m.undo.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('家事の初期画面は通常ToDo、切り替え時に不要な購読を解除する', async () => {
  render(ui(<ChoresPanel />))
  expect(screen.getByText('通常ToDo')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '繰り返し' }))
  await waitFor(() => expect(m.watch).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: '履歴' }))
  expect(m.stop).toHaveBeenCalled()
  expect(screen.queryByLabelText('タイトル')).toBeNull()
})
it('作成の初期値・入力不備・連打・失敗時の入力保持と再試行', async () => {
  render(ui(<RecurringPanel />))
  act(() => publish([], false))
  expect((screen.getByLabelText('頻度') as HTMLSelectElement).value).toBe(
    'weekly',
  )
  expect((screen.getByLabelText('担当') as HTMLSelectElement).value).toBe(
    'self',
  )
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  expect(m.create).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '洗濯' },
  })
  let reject: (e: unknown) => void = () => {}
  m.create.mockReturnValueOnce(
    new Promise((_r, r) => {
      reject = r
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  fireEvent.click(screen.getByRole('button', { name: '保存中…' }))
  expect(m.create).toHaveBeenCalledOnce()
  await act(async () => reject({ code: 'unavailable' }))
  expect((screen.getByLabelText('タイトル') as HTMLInputElement).value).toBe(
    '洗濯',
  )
  expect(screen.getByRole('status').textContent).toContain('通信')
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(2))
})
it('編集は選んだ版を保ち、次回予定を確認させ、失敗しても下書きを保持する', async () => {
  render(ui(<RecurringPanel />))
  act(() => publish([r], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：掃除' }))
  expect((screen.getByLabelText('次回予定') as HTMLInputElement).value).toBe(
    '2026-10-19',
  )
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '編集中' },
  })
  act(() => publish([{ ...r, version: 2, title: '別端末の更新' }], false))
  m.edit.mockRejectedValueOnce({ code: 'recurring-conflict' })
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(m.edit).toHaveBeenCalledOnce())
  expect(m.edit.mock.calls[0]?.[2].version).toBe(1)
  expect((screen.getByLabelText('タイトル') as HTMLInputElement).value).toBe(
    '編集中',
  )
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(screen.queryByLabelText('次回予定')).toBeNull()
})
it('停止/再開・完了・通信エラーと空一覧・追加表示', async () => {
  render(ui(<RecurringPanel />))
  act(() => fail())
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  await waitFor(() => expect(m.watch).toHaveBeenCalledTimes(2))
  act(() => publish([r], true))
  fireEvent.click(screen.getByRole('button', { name: '一時停止：掃除' }))
  await waitFor(() => expect(m.active).toHaveBeenCalledWith('h', 'a', r, false))
  fireEvent.click(screen.getByRole('button', { name: '完了にする：掃除' }))
  await waitFor(() => expect(m.complete).toHaveBeenCalledOnce())
  act(() => publish([{ ...r, active: false }], true))
  expect(screen.queryByRole('button', { name: '完了にする：掃除' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '再開：掃除' }))
  await waitFor(() =>
    expect(m.active).toHaveBeenLastCalledWith(
      'h',
      'a',
      { ...r, active: false },
      true,
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'さらに100件表示' }))
  await waitFor(() => expect(m.watch.mock.lastCall?.[1].count).toBe(200))
})
it('履歴は直近参照と版が一致する未取消だけ取り消せ、取消済み履歴は残す', async () => {
  render(ui(<HistoryPanel />))
  act(() =>
    publish(
      [
        entry,
        { ...entry, id: 'r_1', scheduleVersion: 1 },
        { ...entry, id: 'r_0', cancelledAt: {}, cancelledBy: 'a' },
      ],
      false,
    ),
  )
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: /完了を取り消す/ }),
    ).toHaveLength(1),
  )
  fireEvent.click(screen.getByRole('button', { name: '完了を取り消す：掃除' }))
  await waitFor(() => expect(m.undo).toHaveBeenCalledWith('h', 'a', entry))
  expect(screen.getByText(/取消済み/)).toBeTruthy()
  expect(screen.getAllByText(/完了を記録：相手/)).toHaveLength(3)
})
it('ホームは今日以前の稼働中家事を10件ずつ独立購読する', async () => {
  render(ui(<TodayRecurring />))
  await waitFor(() =>
    expect(m.watch.mock.lastCall?.[1]).toMatchObject({
      kind: 'today',
      count: 10,
      today: expect.any(String),
    }),
  )
  act(() => publish([r], true))
  expect(screen.getByText('掃除')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'さらに10件表示' }))
  await waitFor(() => expect(m.watch.mock.lastCall?.[1].count).toBe(20))
})

it('保存待ちの間に別の家事を編集しても、先の保存完了で新しい下書きを閉じない', async () => {
  render(ui(<RecurringPanel />))
  act(() => publish([r, { ...r, id: 's', title: '別の家事' }], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：掃除' }))
  let done: () => void = () => {}
  m.edit.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      done = resolve
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  fireEvent.click(screen.getByRole('button', { name: '編集：別の家事' }))
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '次の下書き' },
  })
  await act(async () => done())
  expect((screen.getByLabelText('タイトル') as HTMLInputElement).value).toBe(
    '次の下書き',
  )
})

it('掃除場所と交代設定を保存し、一般の初期値は固定のまま', async () => {
  render(ui(<RecurringPanel />))
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '床' },
  })
  fireEvent.change(screen.getByLabelText('掃除場所'), {
    target: { value: ' 台所 ' },
  })
  fireEvent.click(screen.getByLabelText('担当を交代する'))
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() => expect(m.create).toHaveBeenCalled())
  expect(m.create.mock.lastCall?.[2]).toMatchObject({
    taskType: 'cleaning',
    place: '台所',
    rotation: 'alternate',
  })
})
it('掃除タブは今日と今週、場所条件を切り替え、参考予定は完了できない', async () => {
  render(ui(<ChoresPanel />))
  fireEvent.click(screen.getByRole('button', { name: '掃除' }))
  await act(async () =>
    publish(
      [
        {
          ...r,
          taskType: 'cleaning',
          place: '台所',
          frequency: 'daily',
          rotation: 'alternate',
          nextDueDate: '2026-10-20',
        },
      ],
      false,
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: '今週' }))
  await act(async () =>
    publish(
      [
        {
          ...r,
          taskType: 'cleaning',
          place: '台所',
          frequency: 'daily',
          rotation: 'alternate',
          nextDueDate: '2026-10-20',
        },
      ],
      false,
    ),
  )
  expect(
    screen.getAllByRole('button', { name: '完了にする：掃除' }),
  ).toHaveLength(1)
  expect(screen.getByText(/未完了を順に完了した場合/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('場所で絞り込み'), {
    target: { value: '台所' },
  })
  fireEvent.click(screen.getByRole('button', { name: '適用' }))
  await waitFor(() =>
    expect(m.watch.mock.lastCall?.[1]).toMatchObject({
      kind: 'cleaning',
      place: '台所',
      count: 100,
    }),
  )
})

it('掃除の追加表示・取得失敗の再試行と画面離脱の購読解除', async () => {
  render(ui(<ChoresPanel />))
  fireEvent.click(screen.getByRole('button', { name: '掃除' }))
  await act(async () => publish([], true))
  fireEvent.click(screen.getByRole('button', { name: 'さらに100件表示' }))
  await waitFor(() =>
    expect(m.watch.mock.lastCall?.[1]).toMatchObject({
      kind: 'cleaning',
      count: 200,
    }),
  )
  await act(async () => fail())
  expect(
    screen.getByText('家事を取得できませんでした。通信を確認してください。'),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  await act(async () => publish([], false))
  expect(screen.getByText('対象の掃除はありません。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'ToDo' }))
  expect(m.stop).toHaveBeenCalled()
  expect(screen.queryByLabelText('場所で絞り込み')).toBeNull()
})
it('担当を2人にすると交代をオフにし、失敗しても場所入力を保持する', async () => {
  render(ui(<RecurringPanel />))
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '床' },
  })
  fireEvent.change(screen.getByLabelText('掃除場所'), {
    target: { value: '台所' },
  })
  fireEvent.click(screen.getByLabelText('担当を交代する'))
  fireEvent.change(screen.getByLabelText('担当'), { target: { value: 'both' } })
  expect(
    (screen.getByLabelText('担当を交代する') as HTMLInputElement).checked,
  ).toBe(false)
  expect(
    (screen.getByLabelText('担当を交代する') as HTMLInputElement).disabled,
  ).toBe(true)
  m.create.mockRejectedValueOnce(new Error('失敗'))
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() => expect(screen.getByText('失敗')).toBeTruthy())
  expect((screen.getByLabelText('掃除場所') as HTMLInputElement).value).toBe(
    '台所',
  )
})
