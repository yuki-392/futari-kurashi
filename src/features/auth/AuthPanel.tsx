import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useAuth } from './context'
import { authMessage, validateEmail, validateRegistration } from './validation'
export function AuthPanel({ children }: { children?: ReactNode }) {
  const auth = useAuth()
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [message, setMessage] = useState('')
  const messageRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (message) messageRef.current?.focus()
  }, [message])
  const run = async (action: () => Promise<string | void>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      setMessage((await action()) || '')
    } catch (error) {
      setMessage(authMessage(error))
    } finally {
      lock.current = false
      setBusy(false)
      setPassword('')
      setConfirmation('')
    }
  }
  const changeMode = (next: typeof mode) => {
    setMode(next)
    setMessage('')
    setPassword('')
    setConfirmation('')
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (lock.current) return
    // 自動入力で入力イベントが発生しない場合も、表示中の値を送る。
    const fields = new FormData(event.currentTarget)
    const submittedEmail = String(fields.get('email') ?? '')
    const submittedPassword = String(fields.get('password') ?? '')
    const invalid =
      mode === 'register'
        ? validateRegistration(
            submittedEmail,
            submittedPassword,
            String(fields.get('confirmation') ?? ''),
          )
        : validateEmail(submittedEmail) ||
          (mode === 'login' && !submittedPassword
            ? 'パスワードを入力してください。'
            : null)
    if (invalid) {
      setMessage(invalid)
      messageRef.current?.focus()
      return
    }
    setEmail(submittedEmail)
    void run(() =>
      mode === 'register'
        ? auth.register(submittedEmail, submittedPassword)
        : mode === 'reset'
          ? auth.reset(submittedEmail)
          : auth.login(submittedEmail, submittedPassword),
    )
  }
  const buttonClass =
    'rounded-xl bg-forest px-5 py-3 text-white disabled:opacity-50'
  const inputClass =
    'mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-base'
  const feedback = message ? (
    <p
      ref={messageRef}
      tabIndex={-1}
      role="status"
      className="mt-4 rounded-xl bg-sage p-4 text-sm leading-7"
    >
      {message}
    </p>
  ) : null
  if (auth.status === 'loading')
    return <p role="status">ログイン状態を確認中です…</p>
  if (auth.status === 'error')
    return (
      <>
        <p role="status">
          ログインの準備ができませんでした。通信状況を確認してください。
        </p>
        <button className={buttonClass} onClick={auth.retry}>
          再試行
        </button>
      </>
    )
  if (auth.status === 'signedIn' && children) return <>{children}</>
  return (
    <div className="rounded-3xl border border-line bg-white p-6">
      {auth.status === 'signedIn' || auth.status === 'unverified' ? (
        <>
          <h2 className="text-xl font-bold">
            {auth.status === 'unverified'
              ? 'メールを確認してください'
              : 'ログインしています'}
          </h2>
          <p className="my-4 break-all">{auth.user?.email}</p>
          {auth.status === 'signedIn' ? (
            <>{children ?? <p>世帯共有は準備中です。</p>}</>
          ) : (
            <>
              <p className="my-4 text-sm leading-7">
                メールのリンクを開いた後、このアプリへ戻って「確認しました」を押してください。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void run(auth.verify)}
                >
                  確認しました
                </button>
                <button
                  className="px-3 py-3"
                  disabled={busy}
                  onClick={() => void run(auth.resend)}
                >
                  確認メールを再送
                </button>
              </div>
            </>
          )}
          <button
            className="mt-5 px-3 py-3 underline"
            disabled={busy}
            onClick={() => void run(auth.logout)}
          >
            ログアウト
          </button>
        </>
      ) : (
        <>
          <h2 className="mb-5 text-xl font-bold">
            {mode === 'register'
              ? 'アカウントを作成'
              : mode === 'reset'
                ? 'パスワードの再設定'
                : 'おかえりなさい'}
          </h2>
          <form onSubmit={submit} noValidate>
            <fieldset disabled={busy} className="space-y-4">
              <label className="block text-sm">
                メールアドレス
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              {mode !== 'reset' ? (
                <label className="block text-sm">
                  パスワード
                  <input
                    className={inputClass}
                    type="password"
                    name="password"
                    aria-label="パスワード"
                    autoComplete={
                      mode === 'register' ? 'new-password' : 'current-password'
                    }
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  {mode === 'register' ? (
                    <span className="mt-2 block text-muted">
                      12文字以上で設定してください。
                    </span>
                  ) : null}
                </label>
              ) : null}
              {mode === 'register' ? (
                <label className="block text-sm">
                  パスワード（確認）
                  <input
                    className={inputClass}
                    type="password"
                    name="confirmation"
                    autoComplete="new-password"
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
              ) : null}
              {feedback}
              <button className={buttonClass} type="submit">
                {busy
                  ? '処理中…'
                  : mode === 'register'
                    ? '登録する'
                    : mode === 'reset'
                      ? '再設定メールを送る'
                      : 'ログインする'}
              </button>
            </fieldset>
          </form>
          <div className="mt-5 flex flex-wrap gap-3 text-sm underline">
            {mode !== 'login' ? (
              <button
                disabled={busy}
                className="py-3"
                onClick={() => changeMode('login')}
              >
                ログインへ
              </button>
            ) : null}
            {mode !== 'register' ? (
              <button
                disabled={busy}
                className="py-3"
                onClick={() => changeMode('register')}
              >
                新規登録へ
              </button>
            ) : null}
            {mode !== 'reset' ? (
              <button
                disabled={busy}
                className="py-3"
                onClick={() => changeMode('reset')}
              >
                パスワードを忘れた方
              </button>
            ) : null}
          </div>
        </>
      )}
      {auth.status !== 'signedOut' ? feedback : null}
    </div>
  )
}
