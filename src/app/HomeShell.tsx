import { ShoppingPanel } from '../features/shopping/ShoppingPanel'
import { useEffect, useRef } from 'react'
import { ChoresPanel } from '../features/recurring-tasks/ChoresPanel'
import { HomePanel } from '../features/home/HomePanel'
import { HouseholdPanel } from '../features/household/HouseholdPanel'
import { AccountControls } from '../features/auth/AccountControls'
import { pages, usePage } from './navigation'

export function HomeShell() {
  const page = usePage()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
  }, [page.id])
  return (
    <div className="app-shell">
      <h1
        ref={heading}
        tabIndex={-1}
        className="mb-6 text-3xl font-bold outline-none"
      >
        {page.label}
      </h1>
      {page.id === 'home' ? (
        <HomePanel />
      ) : page.id === 'chores' ? (
        <ChoresPanel />
      ) : page.id === 'shopping' ? (
        <ShoppingPanel />
      ) : page.id === 'settings' ? (
        <>
          <HouseholdPanel />
          <AccountControls />
        </>
      ) : (
        <section className="rounded-3xl border border-line bg-white p-6">
          <p role="status" className="font-semibold text-forest">
            準備中です
          </p>
          <p className="mt-3 text-sm leading-7 text-muted">
            {page.id === 'finances'
              ? '家計管理はPhase 2で追加します。'
              : `${page.label}の機能は、これから順番に追加します。`}
          </p>
          <a
            className="mt-5 inline-flex min-h-11 items-center text-forest underline"
            href="#/home"
          >
            ホームへ戻る
          </a>
        </section>
      )}
      <nav className="bottom-nav" aria-label="主要メニュー">
        <div className="mx-auto grid max-w-2xl grid-cols-6 gap-1">
          {pages.map((entry) => (
            <a
              key={entry.id}
              href={`#/${entry.id}`}
              aria-current={entry.id === page.id ? 'page' : undefined}
              className="nav-item"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={entry.path} />
              </svg>
              <span>{entry.label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
