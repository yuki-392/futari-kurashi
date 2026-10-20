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
import { DeclutterPanel, HomeDeclutter } from './DeclutterPanel'
import type { DeclutterItem } from './model'
const m = vi.hoisted(() => ({
  watch: vi.fn(),
  stop: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('./service', () => ({
  watchDeclutter: m.watch,
  createDeclutter: m.create,
  changeDeclutter: m.change,
  removeDeclutter: m.remove,
}))
const home: HouseholdContextValue = {
  status: 'joined',
  uid: 'a',
  email: 'a@example.test',
  household: {
    id: 'h',
    name: '世帯',
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
const item: DeclutterItem = {
  id: 'd',
  title: '古い服',
  method: 'sell',
  ownerIds: ['b'],
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
let publish: (items: DeclutterItem[], more: boolean) => void, fail: () => void
const ui = (node: React.ReactNode) => (
  <HouseholdContext.Provider value={home}>{node}</HouseholdContext.Provider>
)
beforeEach(() => {
  m.watch.mockImplementation((_h, _q, next, error) => {
    publish = next
    fail = error
    return m.stop
  })
  m.create.mockResolvedValue(undefined)
  m.change.mockResolvedValue(undefined)
  m.remove.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('初期値、入力不備、二重送信防止、失敗時の値保持と再試行', async () => {
  render(ui(<DeclutterPanel />))
  act(() => publish([], false))
  expect((screen.getByLabelText('処分方法') as HTMLSelectElement).value).toBe(
    'hold',
  )
  expect((screen.getByLabelText('所有者') as HTMLSelectElement).value).toBe(
    'self',
  )
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  expect(m.create).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('品名'), {
    target: { value: '古い椅子' },
  })
  let reject: (e: Error) => void = () => {}
  m.create.mockImplementationOnce(
    () =>
      new Promise((_r, bad) => {
        reject = bad
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  fireEvent.submit(screen.getByLabelText('品名').closest('form')!)
  expect(m.create).toHaveBeenCalledOnce()
  await act(async () => reject(new Error('通信失敗')))
  expect((screen.getByLabelText('品名') as HTMLInputElement).value).toBe(
    '古い椅子',
  )
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(2))
  expect(m.create.mock.lastCall?.[2]).toMatchObject({
    dueDate: null,
    method: 'hold',
    ownerIds: ['a'],
  })
})
it('購入と解除、品名つき削除確認の取消と確定', async () => {
  render(ui(<DeclutterPanel />))
  act(() => publish([item], false))
  expect(screen.getByText(/所有者：相手/)).toBeTruthy()
  fireEvent.click(
    screen.getByRole('button', { name: '処分済みにする：古い服' }),
  )
  await waitFor(() => expect(m.change).toHaveBeenCalled())
  expect(m.change.mock.lastCall?.[3]).toEqual({ completed: true })
  fireEvent.click(screen.getByRole('button', { name: '削除：古い服' }))
  expect(
    screen.getByRole('group', { name: '削除の確認' }).textContent,
  ).toContain('古い服')
  fireEvent.click(screen.getByRole('button', { name: '削除をやめる' }))
  expect(m.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '削除：古い服' }))
  fireEvent.click(screen.getByRole('button', { name: '削除する' }))
  await waitFor(() => expect(m.remove).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: '処分済み' }))
  act(() => publish([{ ...item, completed: true }], false))
  fireEvent.click(screen.getByRole('button', { name: '未処分に戻す：古い服' }))
  await waitFor(() =>
    expect(m.change.mock.lastCall?.[3]).toEqual({ completed: false }),
  )
})
it('編集の競合でも下書きを残し処分方法と追加表示はサーバーへ渡す', async () => {
  render(ui(<DeclutterPanel />))
  act(() => publish([item], true))
  fireEvent.click(screen.getByRole('button', { name: '編集：古い服' }))
  fireEvent.change(screen.getByLabelText('品名'), {
    target: { value: '下書き' },
  })
  m.change.mockRejectedValueOnce({ code: 'declutter-conflict' })
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(screen.getByText(/別の端末で更新/)).toBeTruthy())
  expect((screen.getByLabelText('品名') as HTMLInputElement).value).toBe(
    '下書き',
  )
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  fireEvent.change(screen.getByLabelText('処分方法で絞り込み'), {
    target: { value: 'hold' },
  })
  await waitFor(() =>
    expect(m.watch.mock.lastCall?.[1]).toMatchObject({
      method: 'hold',
      count: 100,
    }),
  )
  act(() => publish([item], true))
  fireEvent.click(screen.getByRole('button', { name: 'さらに100件表示' }))
  await waitFor(() => expect(m.watch.mock.lastCall?.[1].count).toBe(200))
  act(() => fail())
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(m.stop).toHaveBeenCalled()
})
it('ホームは独立した5件クエリと追加案内、編集/削除/総件数はない', async () => {
  const view = render(ui(<HomeDeclutter />))
  act(() => publish([item], true))
  expect(m.watch.mock.lastCall?.[1]).toMatchObject({
    completed: false,
    count: 5,
    through: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  })
  expect(screen.getByText('ほかにもあります')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '削除：古い服' })).toBeNull()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  view.unmount()
  expect(m.stop).toHaveBeenCalledOnce()
})

it('保存待ちの間に別の商品を開いても、その下書きを閉じない', async () => {
  render(ui(<DeclutterPanel />))
  act(() => publish([item, { ...item, id: 's2', title: 'パン' }], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：古い服' }))
  let resolve: () => void = () => {}
  m.change.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  fireEvent.click(screen.getByRole('button', { name: '編集：パン' }))
  fireEvent.change(screen.getByLabelText('品名'), {
    target: { value: '次の下書き' },
  })
  await act(async () => resolve())
  expect((screen.getByLabelText('品名') as HTMLInputElement).value).toBe(
    '次の下書き',
  )
})

it('保留の完了は変更を送らず案内し、処分済み削除は完了情報の消失も示す', async () => {
  render(ui(<DeclutterPanel />))
  act(() => publish([{ ...item, method: 'hold' }], false))
  fireEvent.click(
    screen.getByRole('button', { name: '処分済みにする：古い服' }),
  )
  await waitFor(() => expect(screen.getByText(/処分方法を捨てる/)).toBeTruthy())
  expect(m.change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '処分済み' }))
  act(() =>
    publish(
      [
        {
          ...item,
          completed: true,
          completedAt: { toDate: () => new Date('2026-10-20T00:00:00Z') },
          completedBy: 'a',
        },
      ],
      false,
    ),
  )
  expect(screen.getByText(/完了を記録した人：自分/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '削除：古い服' }))
  expect(
    screen.getByRole('group', { name: '削除の確認' }).textContent,
  ).toContain('完了情報も消え')
})
it('画面離脱・アカウント変更では購読と入力を破棄する', () => {
  const view = render(ui(<DeclutterPanel />))
  act(() => publish([item], false))
  fireEvent.change(screen.getByLabelText('品名'), {
    target: { value: '私的な下書き' },
  })
  view.unmount()
  expect(m.stop).toHaveBeenCalled()
  render(
    <HouseholdContext.Provider value={{ ...home, uid: 'b' }}>
      <DeclutterPanel />
    </HouseholdContext.Provider>,
  )
  expect((screen.getByLabelText('品名') as HTMLInputElement).value).toBe('')
  expect(screen.queryByText('古い服')).toBeNull()
})

it('日本時間の日付変更と前面復帰でホームの取得日を更新し、期限切れを表示する', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-10-20T14:59:59Z'))
    const view = render(ui(<HomeDeclutter />))
    expect(m.watch.mock.lastCall?.[1].through).toBe('2026-10-20')
    act(() => vi.advanceTimersByTime(1100))
    expect(m.watch.mock.lastCall?.[1].through).toBe('2026-10-21')
    act(() => publish([item], false))
    expect(screen.getByText(/期限切れ/)).toBeTruthy()
    act(() => {
      vi.setSystemTime(new Date('2026-10-23T00:00:00Z'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(m.watch.mock.lastCall?.[1].through).toBe('2026-10-23')
    view.unmount()
  } finally {
    vi.useRealTimers()
  }
})
it('1人世帯は相手・2人を選べず、取得失敗でも追加フォームを保持する', () => {
  render(
    <HouseholdContext.Provider
      value={{ ...home, household: { ...home.household!, memberIds: ['a'] } }}
    >
      <DeclutterPanel />
    </HouseholdContext.Provider>,
  )
  for (const name of ['相手', '2人'])
    expect(
      (screen.getByRole('option', { name }) as HTMLOptionElement).disabled,
    ).toBe(true)
  fireEvent.change(screen.getByLabelText('品名'), {
    target: { value: '保持する入力' },
  })
  act(() => fail())
  expect(screen.getByText(/取得できませんでした/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect((screen.getByLabelText('品名') as HTMLInputElement).value).toBe(
    '保持する入力',
  )
})
