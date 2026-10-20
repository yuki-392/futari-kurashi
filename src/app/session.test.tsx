// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  AuthContext,
  type AuthState,
  type AuthActions,
} from '../features/auth/context'
import AuthSection from '../features/auth/AuthSection'
const mock = vi.hoisted(() => ({ watch: vi.fn(), stop: vi.fn() }))
vi.mock('../features/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../features/household/service', () => ({
  watchHousehold: mock.watch,
  createHousehold: vi.fn(),
  issueInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  inspectInvitation: vi.fn(),
  joinHousehold: vi.fn(),
}))
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
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  history.replaceState(null, '', '#/home')
})
it('既存セッションの直接アクセスを維持し、画面移動で購読を増やさず、認証変更時は解除してホームへ戻す', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  mock.watch.mockImplementation((uid, onValue) => {
    onValue({
      id: uid,
      name: `${uid}の世帯`,
      ownerId: uid,
      memberIds: [uid],
      activeInviteId: null,
    })
    return mock.stop
  })
  history.replaceState(null, '', '#/settings')
  const ui = (value: typeof auth) => (
    <AuthContext.Provider value={value}>
      <AuthSection />
    </AuthContext.Provider>
  )
  const view = render(ui(auth))
  await screen.findByRole('heading', { name: '設定' })
  expect(mock.watch).toHaveBeenCalledTimes(1)
  for (const hash of ['#/shopping', '#/settings']) {
    await act(async () => {
      location.hash = hash
      window.dispatchEvent(new Event('hashchange'))
    })
  }
  expect(mock.watch).toHaveBeenCalledTimes(1)
  view.rerender(ui({ ...auth, status: 'signedOut', user: null }))
  expect(screen.queryByRole('navigation')).toBeNull()
  expect(screen.queryByText('aの世帯')).toBeNull()
  expect(mock.stop).toHaveBeenCalledOnce()
  expect(location.hash).toBe('#/home')
  history.replaceState(null, '', '#/settings')
  view.rerender(
    ui({ ...auth, user: { uid: 'b', email: 'b@example.test' } as User }),
  )
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'ホーム' })).toBeTruthy(),
  )
  expect(screen.getByText('bの世帯')).toBeTruthy()
  expect(screen.queryByText('aの世帯')).toBeNull()
  expect(mock.watch).toHaveBeenCalledTimes(2)
})
