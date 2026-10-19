// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HouseholdProvider } from './HouseholdProvider'
import { HouseholdPanel } from './HouseholdPanel'
import type { Household } from './model'
const mock = vi.hoisted(() => ({
  watch: vi.fn(),
  stop: vi.fn(),
  create: vi.fn(),
  inspect: vi.fn(),
  join: vi.fn(),
  issue: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('./service', () => ({
  watchHousehold: mock.watch,
  createHousehold: mock.create,
  inspectInvitation: mock.inspect,
  joinHousehold: mock.join,
  issueInvitation: mock.issue,
  cancelInvitation: mock.cancel,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
let publish: (household: Household | null) => void
let fail: () => void
async function start() {
  mock.watch.mockImplementation((_uid, onValue, onError) => {
    publish = onValue
    fail = onError
    return mock.stop
  })
  const view = render(
    <HouseholdProvider uid="owner" email="owner@example.test">
      <HouseholdPanel />
    </HouseholdProvider>,
  )
  await waitFor(() => expect(mock.watch).toHaveBeenCalled())
  return view
}
it('確認中を経て未所属フォームを表示し、購読を解除する', async () => {
  const view = await start()
  expect(screen.getByRole('status').textContent).toContain('確認中')
  act(() => publish(null))
  expect(screen.getByRole('button', { name: '世帯を作る' })).toBeTruthy()
  view.unmount()
  expect(mock.stop).toHaveBeenCalledOnce()
})
it('不正な世帯名を送らず、処理中の二重作成を防ぐ', async () => {
  await start()
  act(() => publish(null))
  fireEvent.change(screen.getByLabelText('世帯名'), { target: { value: '  ' } })
  fireEvent.click(screen.getByRole('button', { name: '世帯を作る' }))
  expect(mock.create).not.toHaveBeenCalled()
  expect(screen.getByRole('status').textContent).toContain('1〜40文字')
  let done = () => {}
  mock.create.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      done = resolve
    }),
  )
  fireEvent.change(screen.getByLabelText('世帯名'), {
    target: { value: '新しい世帯' },
  })
  fireEvent.click(screen.getByRole('button', { name: '世帯を作る' }))
  fireEvent.click(screen.getAllByRole('button', { name: '処理中…' })[0]!)
  expect(mock.create).toHaveBeenCalledOnce()
  await act(async () => done())
})
it('購読エラーと操作エラーから再試行できる', async () => {
  await start()
  act(() => fail())
  fireEvent.click(screen.getByRole('button', { name: '世帯情報を再取得' }))
  await waitFor(() => expect(mock.watch).toHaveBeenCalledTimes(2))
  act(() => publish(null))
  mock.create.mockRejectedValueOnce({ code: 'unavailable' })
  fireEvent.click(screen.getByRole('button', { name: '世帯を作る' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('通信'),
  )
  expect(screen.getByRole('button', { name: '世帯を作る' })).toBeTruthy()
})
it('招待の確認後にだけ参加し、所属済みでは人数を表示する', async () => {
  await start()
  act(() => publish(null))
  mock.inspect.mockResolvedValueOnce({
    code: 'a'.repeat(32),
    householdId: 'home',
    householdName: '一緒の家',
    targetEmail: 'owner@example.test',
    createdAt: { toMillis: () => Date.now() },
    usedBy: null,
  })
  fireEvent.change(screen.getByLabelText('招待コード'), {
    target: { value: 'a'.repeat(32) },
  })
  fireEvent.click(screen.getByRole('button', { name: '招待を確認する' }))
  await waitFor(() =>
    expect(screen.getByText('一緒の家に参加しますか？')).toBeTruthy(),
  )
  fireEvent.click(screen.getByRole('button', { name: '参加する' }))
  await waitFor(() => expect(mock.join).toHaveBeenCalledOnce())
  act(() =>
    publish({
      id: 'home',
      name: '一緒の家',
      ownerId: 'partner',
      memberIds: ['partner', 'owner'],
      activeInviteId: null,
    }),
  )
  expect(screen.getByText('参加人数：2 / 2人')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '参加する' })).toBeNull()
})

it('招待をコピーでき、相手のメールを指定して再発行・取消できる', async () => {
  await start()
  act(() =>
    publish({
      id: 'home',
      name: 'ふたりの暮らし',
      ownerId: 'owner',
      memberIds: ['owner'],
      activeInviteId: 'a'.repeat(32),
    }),
  )
  const copy = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: copy },
  })
  fireEvent.click(screen.getByRole('button', { name: 'コードをコピー' }))
  await waitFor(() =>
    expect(copy).toHaveBeenCalledWith(Array(8).fill('aaaa').join('-')),
  )
  fireEvent.change(screen.getByLabelText('相手のメールアドレス'), {
    target: { value: ' Partner@Example.Test ' },
  })
  fireEvent.click(screen.getByRole('button', { name: '招待コードを再発行' }))
  await waitFor(() =>
    expect(mock.issue).toHaveBeenCalledWith(
      'owner',
      'home',
      'partner@example.test',
    ),
  )
  fireEvent.click(screen.getByRole('button', { name: '招待を取り消す' }))
  await waitFor(() => expect(mock.cancel).toHaveBeenCalledWith('owner', 'home'))
})
