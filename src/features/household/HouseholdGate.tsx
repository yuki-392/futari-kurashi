import { useEffect } from 'react'
import { HomeShell } from '../../app/HomeShell'
import { resetPage } from '../../app/navigation'
import { AccountControls } from '../auth/AccountControls'
import { HouseholdPanel } from './HouseholdPanel'
import { useHousehold } from './context'

export function HouseholdGate() {
  const { status, household } = useHousehold()
  useEffect(() => {
    if (status === 'none') resetPage()
  }, [status])
  if (status === 'joined' && household) return <HomeShell />
  return (
    <div className="rounded-3xl border border-line bg-white p-6">
      <h1 className="mb-5 text-2xl font-bold">ふたりの暮らしをはじめる</h1>
      <HouseholdPanel />
      <AccountControls />
    </div>
  )
}
