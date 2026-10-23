import { useState } from 'react'
import { HouseholdPanel } from '../features/household/HouseholdPanel'
import { AccountControls } from '../features/auth/AccountControls'
import { HouseRulesPanel } from '../features/house-rules/HouseRulesPanel'
export function SettingsPanel() {
  const [view, setView] = useState<'account' | 'rules'>('account')
  return (
    <div>
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="設定の表示"
      >
        {(['account', 'rules'] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            className={
              view === id
                ? 'task-primary'
                : 'rounded-xl border border-line px-4 py-3'
            }
            onClick={() => setView(id)}
          >
            {id === 'account' ? '世帯・アカウント' : '家のルール'}
          </button>
        ))}
      </div>
      {view === 'account' ? (
        <>
          <h2 tabIndex={-1} className="sr-only">
            世帯・アカウント
          </h2>
          <HouseholdPanel />
          <AccountControls />
        </>
      ) : (
        <HouseRulesPanel />
      )}
    </div>
  )
}
