import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { observeUpdates } from '../lib/pwa/observeUpdates'

type UpdateError = 'registration' | 'check' | 'apply' | null

const errorMessages = {
  registration:
    'アプリの更新準備ができませんでした。オンラインで再読み込みしてください。',
  check:
    '更新を確認できませんでした。通信状況を確認してください。画面に戻ると再確認します。',
  apply: '更新できませんでした。通信状況を確認して、もう一度お試しください。',
}

export function PwaUpdateNotice() {
  const [error, setError] = useState<UpdateError>(null)
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>()
  const [applying, setApplying] = useState(false)
  const applyingRef = useRef(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      setError('registration')
    },
    onRegisteredSW(_url, registered) {
      setRegistration(registered)
    },
  })

  useEffect(() => {
    if (!registration) return
    return observeUpdates(registration, {
      onWaiting: () => setNeedRefresh(true),
      onFailure: () =>
        setError((current) => (current === 'apply' ? current : 'check')),
      onSuccess: () =>
        setError((current) => (current === 'check' ? null : current)),
    })
  }, [registration, setNeedRefresh])

  if (!needRefresh && !error) return null

  const applyUpdate = async () => {
    if (applyingRef.current) return
    applyingRef.current = true
    setApplying(true)
    setError(null)
    try {
      await updateServiceWorker(true)
      // 適用完了時はService Workerが再読み込みするまで操作を止める。
    } catch {
      applyingRef.current = false
      setApplying(false)
      setError('apply')
    }
  }

  return (
    <aside className="notice" aria-label="アプリの更新">
      {needRefresh ? <p>新しいバージョンを利用できます。</p> : null}
      {error ? (
        <p role="status" className="mt-2">
          {errorMessages[error]}
        </p>
      ) : null}
      {needRefresh ? (
        <div className="mt-3 flex gap-3">
          <button
            className="rounded-xl bg-forest px-4 py-3 text-white disabled:opacity-60"
            disabled={applying}
            onClick={() => {
              void applyUpdate()
            }}
          >
            {applying ? '更新しています…' : '更新する'}
          </button>
          <button
            className="px-4 py-3"
            disabled={applying}
            onClick={() => {
              setNeedRefresh(false)
              setError(null)
            }}
          >
            あとで
          </button>
        </div>
      ) : (
        <button className="mt-3 px-4 py-3" onClick={() => setError(null)}>
          閉じる
        </button>
      )}
    </aside>
  )
}
