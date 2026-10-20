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
} from '../features/household/context'
import {
  AuthContext,
  type AuthActions,
  type AuthState,
} from '../features/auth/context'
import { HomeShell } from './HomeShell'
import { HouseholdGate } from '../features/household/HouseholdGate'
import { AuthPanel } from '../features/auth/AuthPanel'
import type { User } from 'firebase/auth'
const home: HouseholdContextValue = {
  status: 'joined',
  uid: 'a',
  email: 'a@example.test',
  household: {
    id: 'h',
    name: 'ふたりのテスト世帯',
    ownerId: 'a',
    memberIds: ['a'],
    activeInviteId: null,
  },
  create: vi.fn(),
  issue: vi.fn(),
  cancel: vi.fn(),
  inspect: vi.fn(),
  join: vi.fn(),
  retry: vi.fn(),
}
const auth: AuthState & AuthActions = {
  status: 'signedIn',
  user: { uid: 'a', email: 'a@example.test' } as User,
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  resend: vi.fn(),
  verify: vi.fn(),
  reset: vi.fn(),
  retry: vi.fn(),
}
function wrap(content: React.ReactNode, value = home) {
  return (
    <AuthContext.Provider value={auth}>
      <HouseholdContext.Provider value={value}>
        {content}
      </HouseholdContext.Provider>
    </AuthContext.Provider>
  )
}
async function route(value: string) {
  await act(async () => {
    location.hash = value
    window.dispatchEvent(new Event('hashchange'))
  })
}
beforeEach(() => {
  history.replaceState(null, '', '#/home')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
it('実世帯と6つの入口を表示し、架空の集計を出さない', () => {
  render(wrap(<HomeShell />))
  expect(screen.getByText('参加人数：1 / 2人')).toBeTruthy()
  expect(screen.getByText('ふたりのテスト世帯')).toBeTruthy()
  expect(screen.getByRole('navigation').querySelectorAll('a')).toHaveLength(6)
  expect(
    screen
      .getByRole('link', { name: 'パートナーを招待する' })
      .getAttribute('href'),
  ).toBe('#/settings')
  expect(screen.queryByText(/0円|0件|完了率/)).toBeNull()
})
it('直接アクセス、画面変更、履歴イベント、不明な画面と見出しフォーカスに対応する', async () => {
  history.replaceState(null, '', '#/shopping')
  render(wrap(<HomeShell />))
  expect(screen.getByRole('heading', { name: '買い物' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('準備中')
  await route('#/finances')
  expect(screen.getByText(/Phase 2/)).toBeTruthy()
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: '家計' }),
  )
  await route('#/chores')
  expect(
    screen.getByRole('navigation').querySelector('[aria-current="page"]')
      ?.textContent,
  ).toContain('家事')
  history.replaceState(null, '', '#/declutter')
  act(() => window.dispatchEvent(new PopStateEvent('popstate')))
  expect(screen.getByRole('heading', { name: '片付け' })).toBeTruthy()
  await route('#/unknown')
  await waitFor(() => expect(location.hash).toBe('#/home'))
  expect(screen.getByRole('heading', { name: 'ホーム' })).toBeTruthy()
})
it('設定だけにメール・招待・ログアウトを表示し、離れるとフォームを破棄する', async () => {
  render(wrap(<HomeShell />))
  expect(screen.queryByText('a@example.test')).toBeNull()
  await route('#/settings')
  fireEvent.change(screen.getByLabelText('相手のメールアドレス'), {
    target: { value: 'b@example.test' },
  })
  fireEvent.click(screen.getByRole('button', { name: '招待コードを発行' }))
  await waitFor(() => expect(home.issue).toHaveBeenCalledWith('b@example.test'))
  await route('#/home')
  await route('#/settings')
  expect(
    (screen.getByLabelText('相手のメールアドレス') as HTMLInputElement).value,
  ).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
  await waitFor(() => expect(auth.logout).toHaveBeenCalledOnce())
})
it('リアルタイムの人数変更でホームを更新する', () => {
  const view = render(wrap(<HomeShell />))
  view.rerender(
    wrap(<HomeShell />, {
      ...home,
      household: { ...home.household!, memberIds: ['a', 'b'] },
    }),
  )
  expect(screen.getByText('参加人数：2 / 2人')).toBeTruthy()
  expect(
    screen.queryByRole('link', { name: 'パートナーを招待する' }),
  ).toBeNull()
})
it.each(['loading', 'none', 'error'] as const)(
  '所属が%sの間はナビを出さず既存の準備画面へ進む',
  async (status) => {
    history.replaceState(null, '', '#/settings')
    render(wrap(<HouseholdGate />, { ...home, status, household: null }))
    expect(screen.queryByRole('navigation')).toBeNull()
    if (status === 'none')
      expect(screen.getByRole('button', { name: '世帯を作る' })).toBeTruthy()
    if (status === 'error') {
      fireEvent.click(screen.getByRole('button', { name: '世帯情報を再取得' }))
      expect(home.retry).toHaveBeenCalled()
    }
  },
)
it('認証前には直接アクセスでも世帯UIを出さない', () => {
  for (const status of [
    'signedOut',
    'unverified',
    'loading',
    'error',
  ] as const) {
    const view = render(
      <AuthContext.Provider value={{ ...auth, status }}>
        <AuthPanel>
          <HomeShell />
        </AuthPanel>
      </AuthContext.Provider>,
    )
    expect(screen.queryByRole('navigation')).toBeNull()
    view.unmount()
  }
})

it('ログアウトの二重操作を防ぎ、通信失敗後は同じ設定画面から再試行できる', async () => {
  history.replaceState(null, '', '#/settings')
  let reject: (reason: unknown) => void = () => {}
  vi.mocked(auth.logout).mockReturnValueOnce(
    new Promise<void>((_resolve, fail) => {
      reject = fail
    }),
  )
  render(wrap(<HomeShell />))
  fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
  const busy = screen.getByRole('button', {
    name: 'ログアウト中…',
  }) as HTMLButtonElement
  expect(busy.disabled).toBe(true)
  fireEvent.click(busy)
  expect(auth.logout).toHaveBeenCalledOnce()
  await act(async () => reject({ code: 'auth/network-request-failed' }))
  expect(screen.getByRole('status').textContent).toContain('通信')
  fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
  await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(2))
})

vi.mock('../features/tasks/service', () => ({
  watchTasks: (
    _id: unknown,
    _q: unknown,
    next: (tasks: never[], more: boolean) => void,
  ) => {
    next([], false)
    return () => {}
  },
}))

vi.mock('../features/recurring-tasks/service', () => ({
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
