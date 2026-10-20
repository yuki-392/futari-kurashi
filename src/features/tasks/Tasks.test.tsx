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
import { TasksPanel } from './TasksPanel'
import { HouseholdGate } from '../household/HouseholdGate'
import { TodayTasks } from './TodayTasks'
import { useTokyoDay } from './useTokyoDay'
import type { Task } from './model'
const mock = vi.hoisted(() => ({
  watch: vi.fn(),
  stop: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('./service', () => ({
  watchTasks: mock.watch,
  createTask: mock.create,
  changeTask: mock.change,
  removeTask: mock.remove,
}))
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
const task: Task = {
  id: 't',
  title: '洗濯',
  assigneeIds: ['a'],
  dueDate: '2026-10-20',
  priority: 'high',
  completed: false,
  version: 1,
  createdBy: 'a',
  updatedBy: 'a',
  createdAt: null,
  updatedAt: null,
}
let publish: (tasks: Task[], more: boolean) => void, fail: () => void
function ui(node: React.ReactNode, value = home) {
  return (
    <HouseholdContext.Provider value={value}>{node}</HouseholdContext.Provider>
  )
}
beforeEach(() => {
  mock.watch.mockImplementation((_id, _q, next, error) => {
    publish = next
    fail = error
    return mock.stop
  })
  mock.create.mockResolvedValue(undefined)
  mock.change.mockResolvedValue(undefined)
  mock.remove.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})
it('読み込み・失敗と再試行・空一覧・有限クエリ・購読解除', async () => {
  const view = render(ui(<TasksPanel />))
  expect(screen.getByRole('status').textContent).toContain('読み込み')
  await waitFor(() =>
    expect(mock.watch).toHaveBeenCalledWith(
      'h',
      { completed: false, count: 100 },
      expect.any(Function),
      expect.any(Function),
    ),
  )
  act(() => fail())
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  await waitFor(() => expect(mock.watch).toHaveBeenCalledTimes(2))
  act(() => publish([], false))
  expect(screen.getByText('未完了のToDoはありません。')).toBeTruthy()
  view.unmount()
  expect(mock.stop).toHaveBeenCalledTimes(2)
})
it('入力不備と作成中の連打を防ぎ、失敗しても入力を残す', async () => {
  render(ui(<TasksPanel />))
  act(() => publish([], false))
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  expect(mock.create).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '洗濯' },
  })
  fireEvent.change(screen.getByLabelText('担当'), { target: { value: 'none' } })
  let reject: (e: unknown) => void = () => {}
  mock.create.mockReturnValueOnce(
    new Promise((_r, r) => {
      reject = r
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  fireEvent.click(screen.getByRole('button', { name: '保存中…' }))
  expect(mock.create).toHaveBeenCalledOnce()
  await act(async () => reject({ code: 'unavailable' }))
  expect((screen.getByLabelText('タイトル') as HTMLInputElement).value).toBe(
    '洗濯',
  )
  expect(screen.getByRole('status').textContent).toContain('通信')
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2))
  expect(mock.create.mock.calls[0]?.[2].assigneeIds).toEqual([])
})
it('担当の選択肢・優先度初期値・オフラインの書き込み抑止', async () => {
  render(
    ui(<TasksPanel />, {
      ...home,
      household: { ...home.household!, memberIds: ['a'] },
    }),
  )
  expect((screen.getByLabelText('担当') as HTMLSelectElement).value).toBe(
    'self',
  )
  expect(
    (screen.getByRole('option', { name: '相手' }) as HTMLOptionElement)
      .disabled,
  ).toBe(true)
  expect(
    (screen.getByRole('option', { name: '2人' }) as HTMLOptionElement).disabled,
  ).toBe(true)
  expect((screen.getByLabelText('優先度') as HTMLSelectElement).value).toBe(
    'medium',
  )
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: 'オフライン' },
  })
  act(() => window.dispatchEvent(new Event('offline')))
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  expect(mock.create).not.toHaveBeenCalled()
  act(() => window.dispatchEvent(new Event('online')))
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  await waitFor(() => expect(mock.create).toHaveBeenCalledOnce())
})
it('編集時の版を保持し競合で入力を失わず、削除は確認後だけ実行する', async () => {
  render(ui(<TasksPanel />))
  act(() => publish([task], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：洗濯' }))
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '洗濯を干す' },
  })
  act(() => publish([{ ...task, title: '別端末の変更', version: 2 }], false))
  mock.change.mockRejectedValueOnce({ code: 'task-conflict' })
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(mock.change).toHaveBeenCalledOnce())
  expect(mock.change.mock.calls[0]?.[2].version).toBe(1)
  expect((screen.getByLabelText('タイトル') as HTMLInputElement).value).toBe(
    '洗濯を干す',
  )
  expect(screen.getByRole('status').textContent).toContain('別の端末')
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  fireEvent.click(screen.getByRole('button', { name: '削除：別端末の変更' }))
  expect(mock.remove).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: '削除する' }),
  )
  fireEvent.click(screen.getByRole('button', { name: '削除をやめる' }))
  expect(mock.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '削除：別端末の変更' }))
  fireEvent.click(screen.getByRole('button', { name: '削除する' }))
  await waitFor(() => expect(mock.remove).toHaveBeenCalledOnce())
  expect(mock.remove.mock.calls[0]?.[2].version).toBe(2)
})
it('完了/解除・完了一覧・追加表示を切り替える', async () => {
  render(ui(<TasksPanel />))
  act(() => publish([task], true))
  fireEvent.click(screen.getByRole('button', { name: '完了にする：洗濯' }))
  await waitFor(() =>
    expect(mock.change).toHaveBeenCalledWith(
      'h',
      'a',
      task,
      { completed: true },
      ['a', 'b'],
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: 'さらに100件表示' }))
  await waitFor(() => expect(mock.watch.mock.lastCall?.[1].count).toBe(200))
  fireEvent.click(screen.getByRole('button', { name: '完了済み' }))
  await waitFor(() =>
    expect(mock.watch.mock.lastCall?.[1]).toEqual({
      completed: true,
      count: 100,
    }),
  )
  act(() => publish([{ ...task, completed: true }], false))
  fireEvent.click(screen.getByRole('button', { name: '未完了に戻す：洗濯' }))
  await waitFor(() =>
    expect(mock.change).toHaveBeenLastCalledWith(
      'h',
      'a',
      { ...task, completed: true },
      { completed: false },
      ['a', 'b'],
    ),
  )
})
it('今日の一覧を家事と独立した条件・10件単位で取得し、未取得分の総数を出さない', async () => {
  render(ui(<TodayTasks />))
  await waitFor(() =>
    expect(mock.watch.mock.lastCall?.[1]).toMatchObject({
      completed: false,
      count: 10,
      dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  act(() => publish([task], true))
  expect(screen.getByText('洗濯')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'さらに10件表示' }))
  await waitFor(() => expect(mock.watch.mock.lastCall?.[1].count).toBe(20))
  expect(screen.queryByText(/全\d+件/)).toBeNull()
})
it('日本時間の日付変更・前面復帰を追跡してイベントを解除する', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-20T14:59:59Z'))
  function Day() {
    return <p>{useTokyoDay()}</p>
  }
  const view = render(<Day />)
  expect(screen.getByText('2026-10-20')).toBeTruthy()
  act(() => vi.advanceTimersByTime(1100))
  expect(screen.getByText('2026-10-21')).toBeTruthy()
  vi.setSystemTime(new Date('2026-10-23T00:00:00Z'))
  act(() => window.dispatchEvent(new Event('focus')))
  expect(screen.getByText('2026-10-23')).toBeTruthy()
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('更新後の行を明示的に編集し直したとき、古い入力と新しい版を混ぜない', async () => {
  render(ui(<TasksPanel />))
  act(() => publish([task], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：洗濯' }))
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '古い下書き' },
  })
  act(() => publish([{ ...task, title: '相手の更新', version: 2 }], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：相手の更新' }))
  expect((screen.getByLabelText('タイトル') as HTMLInputElement).value).toBe(
    '相手の更新',
  )
})

it('世帯が変わると前の世帯の編集中入力と版を破棄する', () => {
  history.replaceState(null, '', '#/chores')
  const view = render(ui(<HouseholdGate />))
  act(() => publish([task], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：洗濯' }))
  fireEvent.change(screen.getByLabelText('タイトル'), {
    target: { value: '前の世帯の下書き' },
  })
  view.rerender(
    ui(<HouseholdGate />, {
      ...home,
      household: { ...home.household!, id: 'other' },
    }),
  )
  expect((screen.getByLabelText('タイトル') as HTMLInputElement).value).toBe('')
  expect(screen.queryByText('洗濯')).toBeNull()
  history.replaceState(null, '', '#/home')
})

vi.mock('../recurring-tasks/service', () => ({
  watchRecurring: (
    _h: unknown,
    _q: unknown,
    next: (items: never[], more: boolean) => void,
  ) => {
    next([], false)
    return () => {}
  },
  watchUndoTargets: () => () => {},
}))

vi.mock('../shopping/service', () => ({
  watchShopping: (
    _id: unknown,
    _q: unknown,
    next: (items: never[], more: boolean) => void,
  ) => {
    next([], false)
    return vi.fn()
  },
  createShopping: vi.fn(),
  changeShopping: vi.fn(),
  removeShopping: vi.fn(),
}))
