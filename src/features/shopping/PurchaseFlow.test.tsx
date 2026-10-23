// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  HouseholdContext,
  type HouseholdContextValue,
} from '../household/context'
import { PurchaseFlow } from './PurchaseFlow'
import type { ShoppingItem } from './model'
const m = vi.hoisted(() => ({
  register: vi.fn(),
  change: vi.fn(),
  retry: vi.fn(),
  status: 'ready',
  archived: false,
}))
vi.mock('./purchaseService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./purchaseService')>()),
  registerShoppingExpense: m.register,
}))
vi.mock('./service', () => ({ changeShopping: m.change }))
vi.mock('../finance/useFinance', () => ({
  useFinanceCategories: () => ({
    status: m.status,
    categories: [
      {
        id: 'expense_food',
        type: 'expense',
        name: '食費',
        archived: m.archived,
      },
      { id: 'expense_other', type: 'expense', name: 'その他', archived: false },
    ],
    retry: m.retry,
  }),
}))
const home = {
  uid: 'a',
  household: { id: 'h', memberIds: ['a', 'b'] },
} as HouseholdContextValue
const item = {
  id: 's',
  title: '牛乳',
  category: 'food',
  budget: 500,
  quantity: '2',
  assigneeIds: ['b'],
  purchased: false,
  version: 1,
} as ShoppingItem
const close = vi.fn()
const ui = (entry = item) =>
  render(
    <HouseholdContext value={home}>
      <PurchaseFlow item={entry} onClose={close} />
    </HouseholdContext>,
  )
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  m.status = 'ready'
  m.archived = false
  m.change.mockResolvedValue(undefined)
  m.register.mockResolvedValue(undefined)
})
it('choice and cancellation do not purchase; purchase only uses existing operation', async () => {
  ui()
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(close).toHaveBeenCalledOnce()
  expect(m.change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '購入だけ' }))
  await waitFor(() =>
    expect(m.change).toHaveBeenCalledWith('h', 'a', item, { purchased: true }, [
      'a',
      'b',
    ]),
  )
  expect(m.register).not.toHaveBeenCalled()
})
it('starts real amount blank, defaults payer to self and confirms expense only, never uses budget', async () => {
  ui()
  fireEvent.click(screen.getByRole('button', { name: '支出も登録' }))
  expect((screen.getByLabelText('金額（円）') as HTMLInputElement).value).toBe(
    '',
  )
  expect((screen.getByLabelText('内容') as HTMLInputElement).value).toBe('牛乳')
  expect(screen.queryByRole('option', { name: '収入' })).toBeNull()
  fireEvent.change(screen.getByLabelText('金額（円）'), {
    target: { value: '101' },
  })
  fireEvent.click(screen.getByRole('button', { name: '購入して支出を登録' }))
  await waitFor(() =>
    expect(m.register).toHaveBeenCalledWith(
      'h',
      'a',
      item,
      expect.objectContaining({
        amount: 101,
        type: 'expense',
        sharing: { payerId: 'a', shares: { a: 50, b: 50 } },
      }),
    ),
  )
})
it('retains input on failure and category retry, prevents double submit and requires valid category', async () => {
  m.register.mockRejectedValue(new Error('通信失敗'))
  const view = ui({ ...item, purchased: true })
  fireEvent.change(screen.getByLabelText('金額（円）'), {
    target: { value: '222' },
  })
  const button = screen.getByRole('button', { name: '支出を登録' })
  fireEvent.click(button)
  fireEvent.click(button)
  await waitFor(() => expect(screen.getByText('通信失敗')).toBeTruthy())
  expect(m.register).toHaveBeenCalledTimes(1)
  m.status = 'error'
  view.rerender(
    <HouseholdContext value={home}>
      <PurchaseFlow item={{ ...item, purchased: true }} onClose={close} />
    </HouseholdContext>,
  )
  expect((screen.getByLabelText('金額（円）') as HTMLInputElement).value).toBe(
    '222',
  )
  expect(
    (screen.getByRole('button', { name: '支出を登録' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  expect(m.retry).toHaveBeenCalledOnce()
})
it('does not silently select a different category if standard mapping is archived', () => {
  m.archived = true
  ui({ ...item, purchased: true })
  expect((screen.getByLabelText('カテゴリ') as HTMLSelectElement).value).toBe(
    '',
  )
})
