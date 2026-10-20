import { lazy, Suspense } from 'react'
import { PwaUpdateNotice } from '../components/PwaUpdateNotice'
import { firebaseConfig } from '../lib/firebase/config'
const AuthSection = lazy(() => import('../features/auth/AuthSection'))

export default function App() {
  return (
    <div className="app-layout">
      <header className="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 py-6 sm:px-8">
        <img src="/favicon.svg" alt="" width="34" height="34" />
        <span className="font-bold tracking-wide text-forest">
          ふたりの暮らし
        </span>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 sm:px-8">
        {firebaseConfig.status === 'configured' ? (
          <Suspense fallback={<p role="status">ログインの準備中です…</p>}>
            <AuthSection />
          </Suspense>
        ) : (
          <section className="rounded-3xl border border-line bg-white p-6">
            <h1 className="text-2xl font-bold">ふたりの暮らし</h1>
            <p className="mt-4 text-forest">家事も、お金も、ふたりで。</p>
            <p role="status" className="mt-5 text-sm leading-7">
              {firebaseConfig.status === 'invalid'
                ? 'Firebase設定に不足・誤りがあります'
                : 'Firebaseの設定待ち'}
            </p>
          </section>
        )}
        <details className="mt-7 rounded-2xl border border-line px-5 py-3 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            iPhoneでホーム画面に追加するには
          </summary>
          <p className="py-3 leading-7 text-muted">
            HTTPSのURLをSafariで開き、共有メニューから「ホーム画面に追加」を選びます。
          </p>
        </details>
        <footer className="py-8 text-xs leading-6 text-muted">
          ふたりの暮らし · 開発中 · {import.meta.env.VITE_APP_BUILD_LABEL}
        </footer>
      </main>
      <PwaUpdateNotice />
    </div>
  )
}
