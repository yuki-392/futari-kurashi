import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdateNotice() {
  const [registrationFailed, setRegistrationFailed] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      setRegistrationFailed(true)
    },
  })

  if (registrationFailed) {
    return (
      <p role="status" className="notice">
        アプリの更新準備ができませんでした。オンラインで再読み込みしてください。
      </p>
    )
  }

  if (!needRefresh) return null

  return (
    <aside className="notice" aria-label="アプリの更新">
      <p>新しいバージョンを利用できます。</p>
      <div className="mt-3 flex gap-3">
        <button
          className="rounded-xl bg-forest px-4 py-3 text-white"
          onClick={() => {
            void updateServiceWorker(true).catch(() => {
              setRegistrationFailed(true)
            })
          }}
        >
          更新する
        </button>
        <button className="px-4 py-3" onClick={() => setNeedRefresh(false)}>
          あとで
        </button>
      </div>
    </aside>
  )
}
