import { PwaUpdateNotice } from '../components/PwaUpdateNotice'
import { firebaseConfig } from '../lib/firebase/config'
import { lazy, Suspense } from 'react'
const AuthSection = lazy(() => import('../features/auth/AuthSection'))

const features = [
  ['家事', '今日のやることを、ふたりで。'],
  ['買い物', '買い忘れを減らす共有リスト。'],
  ['片付け', '持ち物を見直して、心地よい部屋へ。'],
]

export default function App() {
  const firebaseStatus =
    firebaseConfig.status === 'configured'
      ? firebaseConfig.useEmulators
        ? 'Firebase Emulator用の設定済み'
        : 'Firebase設定済み（接続は未確認）'
      : firebaseConfig.status === 'invalid'
        ? 'Firebase設定に不足・誤りがあります'
        : 'Firebaseの設定待ち'

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pb-12 pt-10 sm:px-10 sm:pt-16">
      <header className="flex items-center gap-3">
        <img src="/favicon.svg" alt="" width="44" height="44" />
        <span className="text-sm font-semibold tracking-widest text-forest">
          FUTARI KURASHI
        </span>
      </header>

      <section className="pb-10 pt-14 sm:pt-20" aria-labelledby="app-title">
        <p className="mb-4 text-sm text-muted">
          ふたりの毎日に、少しのゆとりを。
        </p>
        <h1
          id="app-title"
          className="text-4xl font-bold leading-tight sm:text-5xl"
        >
          ふたりの暮らし
        </h1>
        <p className="mt-5 text-xl font-medium text-forest">
          家事も、お金も、ふたりで。
        </p>
        <p className="mt-6 max-w-md text-sm leading-8 text-muted">
          家事、買い物、片付け。暮らしのあれこれを一緒に整える、
          ふたりのための生活管理アプリです。
        </p>
      </section>

      <section className="rounded-3xl border border-line bg-white p-6 sm:p-8">
        {firebaseConfig.status === 'configured' ? (
          <Suspense fallback={<p role="status">ログインの準備中です…</p>}>
            <AuthSection />
          </Suspense>
        ) : (
          <>
            <p className="text-xs font-semibold tracking-wider text-forest">
              はじめの一歩
            </p>
            <h2 className="mt-3 text-lg font-bold">
              暮らしを整える準備をしています
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              開発環境の起動を確認できました。ログインや共有リストなどの機能は、これから順番に追加していきます。
            </p>
            <p
              className="mt-5 rounded-xl bg-sage px-4 py-3 text-sm text-forest"
              role="status"
            >
              {firebaseStatus}
            </p>
          </>
        )}
      </section>

      <section className="mt-9" aria-labelledby="features-title">
        <h2 id="features-title" className="text-sm font-semibold text-muted">
          これからできること
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {features.map(([name, description]) => (
            <li
              key={name}
              className="flex flex-wrap items-baseline gap-x-5 gap-y-1 py-5"
            >
              <span className="min-w-12 font-semibold">{name}</span>
              <span className="text-sm text-muted">{description}</span>
            </li>
          ))}
        </ul>
      </section>

      <details className="mt-7 rounded-2xl border border-line px-5 py-4 text-sm">
        <summary className="min-h-8 cursor-pointer font-medium leading-8">
          iPhoneでホーム画面に追加するには
        </summary>
        <p className="pb-2 pt-3 leading-7 text-muted">
          HTTPSで公開後、SafariでURLを開き、共有メニューから「ホーム画面に追加」を選びます。
          現時点は開発用の確認画面です。
        </p>
      </details>
      <footer className="mt-10 text-xs leading-6 text-muted">
        ふたりの暮らし · 開発準備版 · {import.meta.env.VITE_APP_BUILD_LABEL}
      </footer>
      <PwaUpdateNotice />
    </main>
  )
}
