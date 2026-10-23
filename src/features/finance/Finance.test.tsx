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
import { FinancePanel } from './FinancePanel'
import type { FinanceCategory, FinanceEntry } from './model'

const m = vi.hoisted(() => ({
  ensure: vi.fn(),
  watchCategories: vi.fn(),
  watchEntries: vi.fn(),
  createEntry: vi.fn(),
  changeEntry: vi.fn(),
  removeEntry: vi.fn(),
  createCategory: vi.fn(),
  changeCategory: vi.fn(),
}))
vi.mock('./service', () => ({
  ensureFinanceCategories: m.ensure,
  watchFinanceCategories: m.watchCategories,
  watchFinanceEntries: m.watchEntries,
  createFinanceEntry: m.createEntry,
  changeFinanceEntry: m.changeEntry,
  removeFinanceEntry: m.removeEntry,
  createFinanceCategory: m.createCategory,
  changeFinanceCategory: m.changeCategory,
}))

const household: HouseholdContextValue = {
  status: 'joined',
  uid: 'a',
  email: 'a@example.test',
  household: {
    id: 'h',
    name: 'ふたり',
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
const cats: FinanceCategory[] = [
  {
    id: 'expense_food',
    type: 'expense',
    name: '食費',
    archived: false,
    standard: true,
    version: 1,
  },
  {
    id: 'income_salary',
    type: 'income',
    name: '給与',
    archived: false,
    standard: true,
    version: 1,
  },
]
let publishCategories: (items: FinanceCategory[]) => void
let publishEntries: (items: FinanceEntry[]) => void
const ui = (node: React.ReactNode) => (
  <HouseholdContext.Provider value={household}>
    {node}
  </HouseholdContext.Provider>
)

beforeEach(() => {
  m.ensure.mockResolvedValue(undefined)
  m.watchCategories.mockImplementation((_h, next) => {
    publishCategories = next
    return vi.fn()
  })
  m.watchEntries.mockImplementation((_h, _o, next) => {
    publishEntries = next
    return vi.fn()
  })
  for (const key of [
    'createEntry',
    'changeEntry',
    'removeEntry',
    'createCategory',
    'changeCategory',
  ])
    m[key as keyof typeof m].mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('月別一覧と合計を表示し、収入・支出を正しいカテゴリで登録する', async () => {
  render(ui(<FinancePanel />))
  await waitFor(() => expect(m.watchCategories).toHaveBeenCalled())
  act(() => publishCategories(cats))
  act(() =>
    publishEntries([
      {
        id: 'e',
        type: 'expense',
        title: '食材',
        amount: 2300,
        date: '2026-10-21',
        categoryId: 'expense_food',
        memo: '',
        version: 1,
        createdAt: null,
        createdBy: 'a',
        updatedAt: null,
        updatedBy: 'a',
      },
      {
        id: 'i',
        type: 'income',
        title: '給与',
        amount: 280000,
        date: '2026-10-20',
        categoryId: 'income_salary',
        memo: '',
        version: 1,
        createdAt: null,
        createdBy: 'b',
        updatedAt: null,
        updatedBy: 'b',
      },
    ]),
  )
  expect(screen.getAllByText('280,000円')).toHaveLength(2)
  expect(screen.getAllByText('2,300円')).toHaveLength(2)
  expect(screen.getByText('食材')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('内容'), { target: { value: '牛乳' } })
  fireEvent.change(screen.getByLabelText('金額（円）'), {
    target: { value: '180' },
  })
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() =>
    expect(m.createEntry).toHaveBeenCalledWith(
      'h',
      'a',
      expect.objectContaining({
        type: 'expense',
        title: '牛乳',
        amount: 180,
        categoryId: 'expense_food',
      }),
      cats,
    ),
  )
})

it('月を切り替え、競合時は編集入力を残す', async () => {
  render(ui(<FinancePanel />))
  await waitFor(() => expect(m.watchCategories).toHaveBeenCalled())
  act(() => publishCategories(cats))
  const entry: FinanceEntry = {
    id: 'e',
    type: 'expense',
    title: '食材',
    amount: 2300,
    date: '2026-10-21',
    categoryId: 'expense_food',
    memo: '',
    version: 1,
    createdAt: null,
    createdBy: 'a',
    updatedAt: null,
    updatedBy: 'a',
  }
  act(() => publishEntries([entry]))
  fireEvent.click(screen.getByRole('button', { name: '編集' }))
  fireEvent.change(screen.getByLabelText('内容'), {
    target: { value: '編集内容' },
  })
  m.changeEntry.mockRejectedValueOnce(
    Object.assign(new Error(), { code: 'finance-conflict' }),
  )
  fireEvent.click(screen.getByRole('button', { name: '保存する' }))
  await waitFor(() => expect(screen.getByText(/別の端末で変更/)).toBeTruthy())
  expect((screen.getByLabelText('内容') as HTMLInputElement).value).toBe(
    '編集内容',
  )
  fireEvent.click(screen.getByRole('button', { name: '前の月' }))
  await waitFor(() =>
    expect(m.watchEntries).toHaveBeenCalledWith(
      'h',
      expect.objectContaining({ month: expect.not.stringMatching('2026-10') }),
      expect.any(Function),
      expect.any(Function),
    ),
  )
})

it('カテゴリの追加、名称変更、アーカイブを実行する', async () => {
  render(ui(<FinancePanel />))
  await waitFor(() => expect(m.watchCategories).toHaveBeenCalled())
  act(() => publishCategories(cats))
  fireEvent.click(screen.getByRole('tab', { name: 'カテゴリ管理' }))
  fireEvent.change(screen.getByLabelText('カテゴリ名'), {
    target: { value: '通信' },
  })
  fireEvent.click(screen.getByRole('button', { name: '追加する' }))
  await waitFor(() =>
    expect(m.createCategory).toHaveBeenCalledWith('h', 'a', 'expense', '通信'),
  )
  fireEvent.change(screen.getByLabelText('食費のカテゴリ名'), {
    target: { value: '食料品' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: '名称変更' })[1]!)
  await waitFor(() =>
    expect(m.changeCategory).toHaveBeenCalledWith('h', 'a', cats[0], {
      name: '食料品',
    }),
  )
  fireEvent.click(
    within(screen.getByRole('region', { name: '支出カテゴリ' })).getByRole(
      'button',
      { name: 'アーカイブ' },
    ),
  )
  await waitFor(() =>
    expect(m.changeCategory).toHaveBeenCalledWith('h', 'a', cats[0], {
      archived: true,
    }),
  )
})

it('focuses deletion confirmation and returns focus on cancel without deleting', async () => {
  render(ui(<FinancePanel />))
  await act(async () => {})
  act(() => publishCategories(cats))
  act(() =>
    publishEntries(
      Array.from({ length: 20 }, (_, i) => ({
        id: `delete-${i}`,
        type: 'expense',
        title: `削除候補${i}`,
        amount: 101,
        date: '2026-10-24',
        categoryId: 'expense_food',
        memo: '',
        sharing: null,
        version: 1,
        createdAt: null,
        createdBy: 'a',
        updatedAt: null,
        updatedBy: 'a',
      })),
    ),
  )
  const button = within(screen.getAllByRole('listitem')[0]!).getByRole(
    'button',
    { name: '削除' },
  )
  button.focus()
  fireEvent.click(button)
  const confirmation = screen.getByRole('group', { name: '削除の確認' })
  expect(confirmation.contains(document.activeElement)).toBe(true)
  expect(m.removeEntry).not.toHaveBeenCalled()
  fireEvent.click(
    within(confirmation).getByRole('button', {
      name: 'キャンセル',
    }),
  )
  expect(document.activeElement).toBe(button)
  expect(m.removeEntry).not.toHaveBeenCalled()
})

it('keeps deletion errors inside confirmation, locks duplicate clicks and allows retry', async () => {
  render(ui(<FinancePanel />))
  await act(async () => {})
  act(() => publishCategories(cats))
  const entry: FinanceEntry = {
    id: 'linked',
    type: 'expense',
    title: '連携明細',
    amount: 101,
    date: '2026-10-24',
    categoryId: 'expense_food',
    memo: '',
    sharing: null,
    shoppingItemId: 'shopping-1',
    version: 2,
    createdAt: null,
    createdBy: 'a',
    updatedAt: null,
    updatedBy: 'a',
  }
  act(() => publishEntries([entry]))
  fireEvent.click(
    within(screen.getByRole('listitem')).getByRole('button', {
      name: '削除',
    }),
  )
  const confirmation = screen.getByRole('group', { name: '削除の確認' })
  expect(confirmation.textContent).toContain('元の買い物は削除されません')
  let reject: (e: Error) => void = () => {}
  m.removeEntry.mockImplementationOnce(
    () =>
      new Promise((_resolve, bad) => {
        reject = bad
      }),
  )
  const button = within(confirmation).getByRole('button', {
    name: '削除する',
  })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(m.removeEntry).toHaveBeenCalledTimes(1)
  await act(async () => reject(new Error('通信失敗')))
  expect(within(confirmation).getByRole('alert').textContent).toContain(
    '通信失敗',
  )
  expect(screen.getByRole('listitem').textContent).toContain('連携明細')
  fireEvent.click(
    within(confirmation).getByRole('button', { name: '削除する' }),
  )
  await waitFor(() => expect(m.removeEntry).toHaveBeenCalledTimes(2))
  expect(m.removeEntry.mock.lastCall).toEqual(['h', entry, 'a'])
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: '削除の確認' })).toBeNull(),
  )
})
