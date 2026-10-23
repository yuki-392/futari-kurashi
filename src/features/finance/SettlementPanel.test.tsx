// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettlementPanel } from './SettlementPanel'
import { FinanceForm } from './FinanceForm'
const m = vi.hoisted(() => ({
  record: vi.fn(),
  cancel: vi.fn(),
  state: {
    status: 'ready',
    complete: true,
    expenses: [
      {
        type: 'expense',
        date: '2026-10-01',
        amount: 101,
        sharing: { payerId: 'a', shares: { a: 50, b: 50 } },
      },
    ],
    months: [{ month: '2026-10', version: 1, netPaid: 0 }],
    payments: [],
    retry: vi.fn(),
  },
}))
vi.mock('../household/context', () => ({
  useHousehold: () => ({
    uid: 'a',
    household: { id: 'h', ownerId: 'a', memberIds: ['a', 'b'] },
  }),
}))
vi.mock('./useSettlements', () => ({ useSettlements: () => m.state }))
vi.mock('./settlementService', () => ({
  recordSettlementPayment: m.record,
  cancelSettlementPayment: m.cancel,
}))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  m.record.mockResolvedValue(undefined)
  m.state.status = 'ready'
  m.state.complete = true
})
it('shows separate base and remaining, confirms a full payment and prevents double submission', async () => {
  let done: () => void = () => {}
  m.record.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        done = resolve
      }),
  )
  render(<SettlementPanel month="2026-10" />)
  expect(screen.getByText(/^元の精算額：/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '残額を精算済みにする' }))
  const button = screen.getByRole('button', { name: '支払いを記録する' })
  fireEvent.click(button)
  const confirm = screen.getByRole('button', { name: '確定して記録' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  expect(m.record).toHaveBeenCalledTimes(1)
  expect(m.record.mock.calls[0]!.slice(0, 2)).toEqual(['h', 'a'])
  expect(m.record.mock.calls[0]![2]).toMatchObject({
    month: '2026-10',
    fromUid: 'b',
    toUid: 'a',
    amount: 50,
  })
  done()
  await waitFor(() =>
    expect(screen.getByText('精算金を記録しました。')).toBeTruthy(),
  )
})
it('does not display or settle exact balances with incomplete or failed sources', () => {
  m.state.complete = false
  const { unmount } = render(<SettlementPanel month="2026-10" />)
  expect(
    screen.queryByRole('button', { name: '残額を精算済みにする' }),
  ).toBeNull()
  expect(screen.getByText(/取得上限/)).toBeTruthy()
  unmount()
  m.state.status = 'error'
  render(<SettlementPanel month="2026-10" />)
  expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy()
})
it('defaults new two-member expenses to self payer and 50%, while retaining legacy exclusion', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(
    <FinanceForm
      categories={[
        {
          id: 'food',
          type: 'expense',
          name: '食費',
          archived: false,
          standard: false,
          version: 1,
        },
      ]}
      onSave={save}
      members={['a', 'b']}
      uid="a"
    />,
  )
  fireEvent.change(screen.getByLabelText('内容'), { target: { value: '食材' } })
  fireEvent.change(screen.getByLabelText('金額（円）'), {
    target: { value: '101' },
  })
  expect(screen.getByText(/自分.*51円.*相手.*50円/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  expect(save.mock.calls[0]![0].sharing).toEqual({
    payerId: 'a',
    shares: { a: 50, b: 50 },
  })
})

it('retains legacy exclusion and does not guess payer from recorder', () => {
  render(
    <FinanceForm
      categories={[
        {
          id: 'food',
          type: 'expense',
          name: '食費',
          archived: false,
          standard: false,
          version: 1,
        },
      ]}
      entry={{
        id: 'legacy',
        type: 'expense',
        title: 'old',
        amount: 101,
        date: '2026-10-01',
        categoryId: 'food',
        memo: '',
        version: 1,
        createdAt: null,
        createdBy: 'b',
        updatedAt: null,
        updatedBy: 'b',
      }}
      onSave={vi.fn()}
      members={['a', 'b']}
      uid="a"
    />,
  )
  expect(
    (screen.getByLabelText('精算対象にする') as HTMLInputElement).checked,
  ).toBe(false)
  expect(screen.getByText(/精算情報未設定/)).toBeTruthy()
})
it('retains edited inputs after a failed submission and requires reconfirmation on stale revision', async () => {
  m.record.mockRejectedValue(
    Object.assign(new Error(), { code: 'finance-conflict' }),
  )
  render(<SettlementPanel month="2026-10" />)
  fireEvent.click(screen.getByRole('button', { name: '部分払いを記録' }))
  fireEvent.change(screen.getByLabelText('精算金（円）'), {
    target: { value: '25' },
  })
  fireEvent.click(screen.getByRole('button', { name: '支払いを記録する' }))
  fireEvent.click(screen.getByRole('button', { name: '確定して記録' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('別の端末'),
  )
  expect(
    (screen.getByLabelText('精算金（円）') as HTMLInputElement).value,
  ).toBe('25')
})

it('explains initial offline loading without showing an exact balance', () => {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
  m.state.status = 'loading'
  render(<SettlementPanel month="2026-10" />)
  expect(screen.getByRole('status').textContent).toContain('オフライン')
  expect(screen.queryByTestId('settlement-remaining')).toBeNull()
  vi.restoreAllMocks()
})
