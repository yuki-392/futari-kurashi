// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HouseRulesPanel } from './HouseRulesPanel'
import { RuleForm } from './RuleForm'
const m = vi.hoisted(() => ({
  create: vi.fn(),
  change: vi.fn(),
  archive: vi.fn(),
  addCategory: vi.fn(),
  rule: {
    id: 'r',
    title: '帰宅後の片付け',
    body: '共有の机を片付ける',
    categoryId: 'chores',
    categoryName: '家事',
    reviewDate: '2026-01-01',
    archived: false,
    version: 1,
    contentVersion: 1,
    agreedUids: [] as string[],
    lastAction: 'create',
    createdAt: null,
    createdBy: 'a',
    updatedAt: null,
    updatedBy: 'a',
  },
  status: 'ready',
  categoryError: false,
  more: false,
}))
vi.mock('../household/context', () => ({
  useHousehold: () => ({
    uid: 'a',
    household: { id: 'h', memberIds: ['a', 'b'] },
  }),
}))
vi.mock('./service', () => ({
  createHouseRule: m.create,
  changeHouseRule: m.change,
  createRuleCategory: m.addCategory,
  setRuleCategoryArchived: m.archive,
}))
vi.mock('./useRuleData', () => ({
  useRuleData: (q: { kind: string }) => ({
    status: q.kind === 'categories' && m.categoryError ? 'error' : m.status,
    items:
      m.status === 'error'
        ? []
        : q.kind === 'categories'
          ? [{ id: 'chores', name: '家事', archived: false, version: 1 }]
          : q.kind === 'history'
            ? [{ id: '1', snapshot: m.rule }]
            : [m.rule],
    more: m.more,
    retry: vi.fn(),
  }),
}))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  m.create.mockResolvedValue(undefined)
  m.change.mockResolvedValue(undefined)
  m.archive.mockResolvedValue(undefined)
  m.addCategory.mockResolvedValue(undefined)
  m.status = 'ready'
  m.categoryError = false
  m.rule.agreedUids = []
})
it('shows Tokyo due review and agreement statuses, only offers own action, preserves history view', async () => {
  render(<HouseRulesPanel />)
  const rule = within(screen.getByRole('article', { name: '帰宅後の片付け' }))
  expect(rule.getByText('見直し時期')).toBeTruthy()
  expect(rule.getByText(/自分：未合意/)).toBeTruthy()
  fireEvent.click(rule.getByRole('button', { name: 'この内容に合意する' }))
  await waitFor(() =>
    expect(m.change).toHaveBeenCalledWith(
      'h',
      'a',
      expect.objectContaining({ contentVersion: 1 }),
      'agree',
    ),
  )
  fireEvent.click(rule.getByRole('button', { name: '履歴' }))
  expect(screen.getByRole('heading', { name: /変更履歴/ })).toBeTruthy()
  expect(screen.getByText(/記録者：自分/)).toBeTruthy()
})
it('confirms retirement, cancellation keeps item and commit calls exact displayed version', async () => {
  render(<HouseRulesPanel />)
  fireEvent.click(screen.getByRole('button', { name: '廃止' }))
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(m.change).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '廃止' }))
  fireEvent.click(screen.getByRole('button', { name: '廃止を確定する' }))
  await waitFor(() =>
    expect(m.change).toHaveBeenCalledWith(
      'h',
      'a',
      expect.objectContaining({ version: 1 }),
      'retire',
    ),
  )
})
it('retains edits and prevents double submission while pending or failed', async () => {
  let reject: (e: unknown) => void = () => {}
  m.create.mockImplementation(
    () =>
      new Promise((_yes, no) => {
        reject = no
      }),
  )
  render(
    <RuleForm
      categories={[{ id: 'chores', name: '家事', archived: false }]}
      onSave={m.create}
    />,
  )
  fireEvent.change(screen.getByLabelText('ルールのタイトル'), {
    target: { value: '入力を残す' },
  })
  fireEvent.change(screen.getByLabelText('ルールの内容'), {
    target: { value: '内容' },
  })
  const save = screen.getByRole('button', { name: '登録する' })
  fireEvent.click(save)
  fireEvent.click(save)
  expect(m.create).toHaveBeenCalledTimes(1)
  reject(Object.assign(new Error(), { code: 'rule-conflict' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('入力は保持'),
  )
  expect(
    (screen.getByLabelText('ルールのタイトル') as HTMLInputElement).value,
  ).toBe('入力を残す')
})
it('does not show data or write controls when loading or failed', () => {
  m.status = 'error'
  render(<HouseRulesPanel />)
  expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '登録する' })).toBeNull()
})

it('moves focus to the edit form heading without opening the keyboard', () => {
  render(
    <RuleForm
      categories={[{ id: 'chores', name: '家事', archived: false }]}
      entry={{ ...m.rule, lastAction: 'create' }}
      onSave={vi.fn()}
    />,
  )
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: 'ルールを編集' }),
  )
})

it('keeps an edited form mounted and blocks saving while category retrieval is failing', () => {
  const view = render(<HouseRulesPanel />)
  fireEvent.click(screen.getByRole('button', { name: '編集' }))
  fireEvent.change(screen.getByLabelText('ルールの内容'), {
    target: { value: '入力を保持する' },
  })
  m.categoryError = true
  view.rerender(<HouseRulesPanel />)
  expect(
    (screen.getByLabelText('ルールの内容') as HTMLTextAreaElement).value,
  ).toBe('入力を保持する')
  expect(
    (screen.getByRole('button', { name: '保存する' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy()
})
