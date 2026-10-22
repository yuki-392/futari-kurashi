// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  HouseholdContext,
  type HouseholdContextValue,
} from '../household/context'
import { BudgetPanel } from './BudgetPanel'
import { HomeFinance } from './HomeFinance'
import type { Budget } from './budgetModel'
const m = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  budgets: vi.fn(),
  entries: vi.fn(),
}))
vi.mock('./budgetService', () => ({
  saveBudget: m.save,
  removeBudget: m.remove,
  copyPreviousBudgets: m.copy,
}))
vi.mock('./useBudgets', () => ({ useBudgets: m.budgets }))
vi.mock('./useFinance', () => ({ useFinanceEntries: m.entries }))
const context = {
  uid: 'a',
  household: { id: 'h', memberIds: ['a', 'b'] },
} as HouseholdContextValue
const categories = [
  {
    id: 'food',
    name: '食費',
    type: 'expense' as const,
    archived: false,
    standard: false,
    version: 1,
  },
]
const budget: Budget = {
  id: '2026-10__total',
  month: '2026-10',
  scope: 'total',
  categoryId: null,
  amount: 100,
  version: 1,
  createdAt: null,
  createdBy: 'a',
  updatedAt: null,
  updatedBy: 'a',
}
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HouseholdContext.Provider value={context}>
    {children}
  </HouseholdContext.Provider>
)
const panel = (budgets: Budget[] = []) => {
  m.budgets.mockReturnValue({
    status: 'ready',
    budgets,
    complete: true,
    retry: vi.fn(),
  })
  return (
    <BudgetPanel
      month="2026-10"
      categories={categories}
      entries={[]}
      complete
      ready
      onRetry={vi.fn()}
    />
  )
}
beforeEach(() => {
  m.save.mockResolvedValue(undefined)
  m.remove.mockResolvedValue(undefined)
  m.copy.mockResolvedValue({ copied: 1, skipped: 1, failed: 1 })
  m.entries.mockReturnValue({
    status: 'ready',
    entries: [],
    complete: true,
    retry: vi.fn(),
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('未設定から0円を設定でき、保存中の二重操作を防ぎ、失敗時も入力を残す', async () => {
  render(panel(), { wrapper })
  const total = within(screen.getByRole('region', { name: '月全体の予算' }))
  fireEvent.click(total.getByRole('button', { name: '予算を設定' }))
  fireEvent.change(total.getByLabelText('月全体の予算額（円）'), {
    target: { value: '0' },
  })
  let resolve!: () => void
  m.save.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        resolve = r
      }),
  )
  fireEvent.click(total.getByRole('button', { name: '保存する' }))
  fireEvent.submit(
    total.getByRole('button', { name: '保存中…' }).closest('form')!,
  )
  expect(m.save).toHaveBeenCalledOnce()
  expect(m.save).toHaveBeenCalledWith('h', 'a', '2026-10', null, 0, null)
  await act(async () => resolve())
  fireEvent.click(total.getByRole('button', { name: '予算を設定' }))
  fireEvent.change(total.getByLabelText('月全体の予算額（円）'), {
    target: { value: '200' },
  })
  m.save.mockRejectedValueOnce(
    Object.assign(new Error(), { code: 'finance-conflict' }),
  )
  fireEvent.click(total.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(total.getByText(/別の端末/)).toBeTruthy())
  expect(
    (total.getByLabelText('月全体の予算額（円）') as HTMLInputElement).value,
  ).toBe('200')
})
it('確認付き解除とキャンセル、コピー部分失敗、実績上限では残額非表示', async () => {
  const { rerender } = render(panel([budget]), { wrapper })
  let total = within(screen.getByRole('region', { name: '月全体の予算' }))
  expect(total.getByText('残り100円')).toBeTruthy()
  fireEvent.click(total.getByRole('button', { name: '設定を解除' }))
  fireEvent.click(total.getByRole('button', { name: 'キャンセル' }))
  expect(m.remove).not.toHaveBeenCalled()
  fireEvent.click(total.getByRole('button', { name: '設定を解除' }))
  fireEvent.click(total.getByRole('button', { name: '解除する' }))
  await waitFor(() => expect(m.remove).toHaveBeenCalledWith('h', budget))
  fireEvent.click(screen.getByRole('button', { name: '前月からコピー' }))
  await waitFor(() => expect(screen.getByText(/成功1件.*失敗1件/)).toBeTruthy())
  rerender(
    <BudgetPanel
      month="2026-10"
      categories={categories}
      entries={[]}
      complete={false}
      ready
      onRetry={vi.fn()}
    />,
  )
  total = within(screen.getByRole('region', { name: '月全体の予算' }))
  expect(total.queryByText('残り100円')).toBeNull()
  expect(screen.getByText(/実績が取得上限/)).toBeTruthy()
})
it('ホームは予算未設定と0円を区別し、実績取得失敗で残額を表示しない', () => {
  m.budgets.mockReturnValue({
    status: 'ready',
    budgets: [],
    complete: true,
    retry: vi.fn(),
  })
  const { rerender } = render(<HomeFinance />, { wrapper })
  expect(screen.getByText('予算未設定')).toBeTruthy()
  m.budgets.mockReturnValue({
    status: 'ready',
    budgets: [{ ...budget, amount: 0 }],
    complete: true,
    retry: vi.fn(),
  })
  m.entries.mockReturnValue({
    status: 'ready',
    entries: [{ type: 'expense', amount: 10, categoryId: 'food' }],
    complete: true,
    retry: vi.fn(),
  })
  rerender(<HomeFinance />)
  expect(screen.getByText('10円超過')).toBeTruthy()
  m.entries.mockReturnValue({
    status: 'error',
    entries: [],
    complete: false,
    retry: vi.fn(),
  })
  rerender(<HomeFinance />)
  expect(screen.queryByText('10円超過')).toBeNull()
  expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy()
})

it('アーカイブ済みカテゴリは予算/実績を保持し、新規設定・編集は表示しない', () => {
  m.budgets.mockReturnValue({
    status: 'ready',
    complete: true,
    budgets: [
      {
        ...budget,
        id: '2026-10__category__food',
        scope: 'category',
        categoryId: 'food',
      },
    ],
    retry: vi.fn(),
  })
  render(
    <BudgetPanel
      month="2026-10"
      categories={[{ ...categories[0]!, archived: true }]}
      entries={[]}
      complete
      ready
      onRetry={vi.fn()}
    />,
    { wrapper },
  )
  const region = within(screen.getByRole('region', { name: '食費の予算' }))
  expect(region.getByText('予算：100円')).toBeTruthy()
  expect(region.queryByRole('button', { name: '予算を編集' })).toBeNull()
  expect(region.getByRole('button', { name: '設定を解除' })).toBeTruthy()
})
it('ホームは日本時間の月替わり・前面復帰で対象月を更新する', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-31T14:59:59Z'))
  try {
    m.budgets.mockReturnValue({
      status: 'ready',
      budgets: [],
      complete: true,
      retry: vi.fn(),
    })
    render(<HomeFinance />, { wrapper })
    expect(m.entries).toHaveBeenLastCalledWith('2026-10', true, 'expense')
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(m.entries).toHaveBeenLastCalledWith('2026-11', true, 'expense')
    vi.setSystemTime(new Date('2026-12-01T00:00:00+09:00'))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(m.budgets).toHaveBeenLastCalledWith('2026-12', true, true)
  } finally {
    vi.useRealTimers()
  }
})
