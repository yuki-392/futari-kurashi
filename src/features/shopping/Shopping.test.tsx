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
import { ShoppingPanel, HomeShopping } from './ShoppingPanel'
import type { ShoppingItem } from './model'
const m = vi.hoisted(() => ({
  watch: vi.fn(),
  stop: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('./service', () => ({
  watchShopping: m.watch,
  createShopping: m.create,
  changeShopping: m.change,
  removeShopping: m.remove,
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
const item: ShoppingItem = {
  id: 's',
  title: '牛乳',
  category: 'food',
  quantity: '2',
  unit: '本',
  budget: 500,
  assigneeIds: ['b'],
  priority: 3,
  purchased: false,
  version: 1,
  createdAt: null,
  updatedAt: null,
  createdBy: 'a',
  updatedBy: 'a',
}
let publish: (items: ShoppingItem[], more: boolean) => void, fail: () => void
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
  render(ui(<ShoppingPanel />))
  act(() => publish([], false))
  expect((screen.getByLabelText('数量') as HTMLInputElement).value).toBe('1')
  expect((screen.getByLabelText('単位') as HTMLInputElement).value).toBe('個')
  expect((screen.getByLabelText('カテゴリ') as HTMLSelectElement).value).toBe(
    'other',
  )
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  expect(m.create).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('商品名'), {
    target: { value: 'お米' },
  })
  fireEvent.change(screen.getByLabelText('数量'), {
    target: { value: '0.500' },
  })
  fireEvent.change(screen.getByLabelText('予算（円・任意）'), {
    target: { value: '0' },
  })
  let reject: (e: Error) => void = () => {}
  m.create.mockImplementationOnce(
    () =>
      new Promise((_r, bad) => {
        reject = bad
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  fireEvent.submit(screen.getByLabelText('商品名').closest('form')!)
  expect(m.create).toHaveBeenCalledOnce()
  await act(async () => reject(new Error('通信失敗')))
  expect((screen.getByLabelText('商品名') as HTMLInputElement).value).toBe(
    'お米',
  )
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(2))
  expect(m.create.mock.lastCall?.[2]).toMatchObject({
    quantity: '0.5',
    budget: 0,
  })
})
it('購入と解除、商品名つき削除確認の取消と確定', async () => {
  render(ui(<ShoppingPanel />))
  act(() => publish([item], false))
  expect(screen.getByText(/担当：相手/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '購入済みにする：牛乳' }))
  expect(m.change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '購入だけ' }))
  await waitFor(() => expect(m.change).toHaveBeenCalled())
  expect(m.change.mock.lastCall?.[3]).toEqual({ purchased: true })
  fireEvent.click(screen.getByRole('button', { name: '削除：牛乳' }))
  expect(
    screen.getByRole('group', { name: '削除の確認' }).textContent,
  ).toContain('牛乳')
  fireEvent.click(screen.getByRole('button', { name: '削除をやめる' }))
  expect(m.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '削除：牛乳' }))
  fireEvent.click(screen.getByRole('button', { name: '削除する' }))
  await waitFor(() => expect(m.remove).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: '購入済み' }))
  act(() => publish([{ ...item, purchased: true }], false))
  fireEvent.click(screen.getByRole('button', { name: '未購入に戻す：牛乳' }))
  await waitFor(() =>
    expect(m.change.mock.lastCall?.[3]).toEqual({ purchased: false }),
  )
})
it('編集の競合でも下書きを残しカテゴリと追加表示はサーバーへ渡す', async () => {
  render(ui(<ShoppingPanel />))
  act(() => publish([item], true))
  fireEvent.click(screen.getByRole('button', { name: '編集：牛乳' }))
  fireEvent.change(screen.getByLabelText('商品名'), {
    target: { value: '下書き' },
  })
  m.change.mockRejectedValueOnce({ code: 'shopping-conflict' })
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(screen.getByText(/別の端末で更新/)).toBeTruthy())
  expect((screen.getByLabelText('商品名') as HTMLInputElement).value).toBe(
    '下書き',
  )
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  fireEvent.change(screen.getByLabelText('カテゴリで絞り込み'), {
    target: { value: 'food' },
  })
  await waitFor(() =>
    expect(m.watch.mock.lastCall?.[1]).toMatchObject({
      category: 'food',
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
  const view = render(ui(<HomeShopping />))
  act(() => publish([item], true))
  expect(m.watch.mock.lastCall?.[1]).toEqual({ purchased: false, count: 5 })
  expect(screen.getByText('ほかにもあります')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '削除：牛乳' })).toBeNull()
  view.unmount()
  expect(m.stop).toHaveBeenCalledOnce()
})

it('保存待ちの間に別の商品を開いても、その下書きを閉じない', async () => {
  render(ui(<ShoppingPanel />))
  act(() => publish([item, { ...item, id: 's2', title: 'パン' }], false))
  fireEvent.click(screen.getByRole('button', { name: '編集：牛乳' }))
  let resolve: () => void = () => {}
  m.change.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve = done
      }),
  )
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  fireEvent.click(screen.getByRole('button', { name: '編集：パン' }))
  fireEvent.change(screen.getByLabelText('商品名'), {
    target: { value: '次の下書き' },
  })
  await act(async () => resolve())
  expect((screen.getByLabelText('商品名') as HTMLInputElement).value).toBe(
    '次の下書き',
  )
})

it('registered items disclose independent expense management and cannot register again', () => {
  render(ui(<ShoppingPanel />))
  act(() =>
    publish([{ ...item, purchased: true, expenseId: 'expense-1' }], false),
  )
  expect(screen.getByText(/支出登録済み/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: '支出に登録：牛乳' })).toBeNull()
})
