import { useRef, useState } from 'react'
import { useAuth } from './context'
import { authMessage } from './validation'

export function AccountControls() {
  const auth = useAuth()
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function logout() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await auth.logout()
    } catch (cause) {
      setError(authMessage(cause))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <section className="mt-6 border-t border-line pt-5" aria-label="アカウント">
      <p className="text-sm text-muted">ログイン中のアカウント</p>
      <p className="mt-2 break-all">{auth.user?.email}</p>
      <button
        className="mt-3 rounded-xl border border-line px-5 py-3 disabled:opacity-50"
        disabled={busy}
        onClick={() => void logout()}
      >
        {busy ? 'ログアウト中…' : 'ログアウト'}
      </button>
      {error ? (
        <p role="status" className="mt-3 text-sm">
          {error}
        </p>
      ) : null}
    </section>
  )
}
