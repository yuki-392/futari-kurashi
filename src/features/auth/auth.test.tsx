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
import { AuthProvider } from './AuthProvider'
import { AuthPanel } from './AuthPanel'
import { authMessage, validateRegistration } from './validation'
import type { User } from 'firebase/auth'

const mock = vi.hoisted(() => ({
  listener: vi.fn<(user: User | null) => void>(),
  failInit: false,
  unsubscribe: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  reset: vi.fn(),
  reload: vi.fn(),
  token: vi.fn(),
  user: {
    email: 'test@example.test',
    uid: 'test',
    emailVerified: false,
  } as User,
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseAuth: async () => {
    if (mock.failInit) throw new Error('init')
    return { currentUser: mock.user }
  },
}))
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, listener: typeof mock.listener) => {
    mock.listener = listener
    return mock.unsubscribe
  },
  signInWithEmailAndPassword: mock.signIn,
  signOut: mock.signOut,
  createUserWithEmailAndPassword: mock.create,
  sendEmailVerification: mock.send,
  sendPasswordResetEmail: mock.reset,
  reload: mock.reload,
  getIdToken: mock.token,
}))
beforeEach(() => {
  vi.clearAllMocks()
  mock.failInit = false
  Object.defineProperty(mock.user, 'emailVerified', {
    value: false,
    writable: true,
    configurable: true,
  })
  mock.create.mockResolvedValue({ user: mock.user })
  mock.send.mockResolvedValue(undefined)
  mock.signIn.mockResolvedValue({ user: mock.user })
  mock.reset.mockResolvedValue(undefined)
})
afterEach(cleanup)
async function start(user: User | null = null) {
  render(
    <AuthProvider>
      <AuthPanel />
    </AuthProvider>,
  )
  await waitFor(() => expect(mock.listener).toBeTypeOf('function'))
  await act(async () => {
    await Promise.resolve()
    mock.listener(user)
  })
}
it('登録の境界とパスワードの一致を検証する', () => {
  expect(
    validateRegistration('abc', '123456789012', '123456789012'),
  ).toBeTruthy()
  expect(
    validateRegistration('a@example.test', '12345678901', '12345678901'),
  ).toBeTruthy()
  expect(
    validateRegistration('a@example.test', '123456789012', 'different'),
  ).toBeTruthy()
  expect(
    validateRegistration('a@example.test', '123456789012', '123456789012'),
  ).toBeNull()
})
it('存在しないユーザーと誤パスワードで同じ案内を表示する', () => {
  expect(authMessage({ code: 'auth/user-not-found' })).toBe(
    authMessage({ code: 'auth/wrong-password' }),
  )
})
it('未入力の登録を止め、画面内に理由を表示する', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: '新規登録へ' }))
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  expect(screen.getByRole('status').textContent).toContain(
    'メールアドレスを確認',
  )
  expect(document.activeElement).toBe(screen.getByRole('status'))
  expect(mock.create).not.toHaveBeenCalled()
})
it('入力イベントがなくてもフォームの現在値を使って登録する', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: '新規登録へ' }))
  // 自動入力と同様、DOMの値だけが更新された状態を再現する。
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!
  setValue.call(
    screen.getByLabelText('メールアドレス'),
    'autofill@example.test',
  )
  setValue.call(screen.getByLabelText('パスワード'), 'Autofill-Password-123')
  setValue.call(
    screen.getByLabelText('パスワード（確認）'),
    'Autofill-Password-123',
  )
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() => expect(mock.create).toHaveBeenCalledOnce())
  expect(mock.create.mock.calls[0]?.slice(1)).toEqual([
    'autofill@example.test',
    'Autofill-Password-123',
  ])
})
it('ログインのパスワード未入力と再設定の不正メールを送信しない', async () => {
  await start()
  fireEvent.change(screen.getByLabelText('メールアドレス'), {
    target: { value: 'test@example.test' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'ログインする' }))
  expect(screen.getByRole('status').textContent).toContain('パスワードを入力')
  expect(mock.signIn).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }))
  fireEvent.change(screen.getByLabelText('メールアドレス'), {
    target: { value: 'invalid' },
  })
  fireEvent.click(screen.getByRole('button', { name: '再設定メールを送る' }))
  expect(screen.getByRole('status').textContent).toContain(
    'メールアドレスを確認',
  )
  expect(mock.reset).not.toHaveBeenCalled()
})
it('初期確認中はログインフォームを出さない', () => {
  render(
    <AuthProvider>
      <AuthPanel />
    </AuthProvider>,
  )
  expect(screen.getByRole('status').textContent).toContain('確認中')
  expect(screen.queryByRole('button', { name: 'ログインする' })).toBeNull()
})
it('未確認ユーザーには準備画面を表示せず、再読込で確認する', async () => {
  await start(mock.user)
  expect(
    screen.getByRole('heading', { name: 'メールを確認してください' }),
  ).toBeTruthy()
  expect(screen.queryByText('世帯共有は準備中です。')).toBeNull()
  mock.reload.mockImplementationOnce(async () => {
    Object.defineProperty(mock.user, 'emailVerified', {
      value: true,
      writable: true,
      configurable: true,
    })
  })
  fireEvent.click(screen.getByRole('button', { name: '確認しました' }))
  await waitFor(() =>
    expect(screen.getByText('世帯共有は準備中です。')).toBeTruthy(),
  )
  expect(mock.token).toHaveBeenCalledWith(mock.user, true)
})
it('登録後の送信失敗でもアカウントを保持し、再送できる', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: '新規登録へ' }))
  fireEvent.change(screen.getByLabelText('メールアドレス'), {
    target: { value: 'test@example.test' },
  })
  fireEvent.change(screen.getByLabelText('パスワード'), {
    target: { value: '123456789012' },
  })
  fireEvent.change(screen.getByLabelText('パスワード（確認）'), {
    target: { value: '123456789012' },
  })
  mock.send.mockRejectedValueOnce({ code: 'auth/network-request-failed' })
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'メールを確認してください' }),
    ).toBeTruthy(),
  )
  expect(mock.create).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '確認メールを再送' }))
  await waitFor(() => expect(mock.send).toHaveBeenCalledTimes(2))
})
it('ログアウト成功後はフォームへ戻る', async () => {
  Object.defineProperty(mock.user, 'emailVerified', {
    value: true,
    writable: true,
    configurable: true,
  })
  await start(mock.user)
  mock.signOut.mockImplementationOnce(async () => mock.listener(null))
  fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'ログインする' })).toBeTruthy(),
  )
})
it('再設定ではユーザー不在でも送信案内を統一する', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: 'パスワードを忘れた方' }))
  fireEvent.change(screen.getByLabelText('メールアドレス'), {
    target: { value: 'missing@example.test' },
  })
  mock.reset.mockRejectedValueOnce({ code: 'auth/user-not-found' })
  fireEvent.click(screen.getByRole('button', { name: '再設定メールを送る' }))
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      '登録されている場合',
    ),
  )
})
it('初期化失敗を再試行でき、購読を解除する', async () => {
  mock.failInit = true
  const result = render(
    <AuthProvider>
      <AuthPanel />
    </AuthProvider>,
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy(),
  )
  mock.failInit = false
  fireEvent.click(screen.getByRole('button', { name: '再試行' }))
  await act(async () => {
    await Promise.resolve()
    mock.listener(null)
  })
  result.unmount()
  expect(mock.unsubscribe).toHaveBeenCalled()
})

it('処理中のログインを重複送信せず、通信エラー後に再試行できる', async () => {
  await start()
  let reject: (reason: unknown) => void = () => {}
  mock.signIn.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail
    }),
  )
  fireEvent.change(screen.getByLabelText('メールアドレス'), {
    target: { value: 'test@example.test' },
  })
  fireEvent.change(screen.getByLabelText('パスワード'), {
    target: { value: '123456789012' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'ログインする' }))
  fireEvent.click(screen.getByRole('button', { name: '処理中…' }))
  await waitFor(() => expect(mock.signIn).toHaveBeenCalledOnce())
  await act(async () => reject({ code: 'auth/network-request-failed' }))
  expect(screen.getByRole('status').textContent).toContain(
    '通信できませんでした',
  )
  expect(screen.getByRole('button', { name: 'ログインする' })).toBeTruthy()
})
