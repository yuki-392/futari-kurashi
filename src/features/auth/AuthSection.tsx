import { AuthProvider } from './AuthProvider'
import { AuthPanel } from './AuthPanel'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { useAuth } from './context'
import { resetPage } from '../../app/navigation'
const HouseholdSection = lazy(() => import('../household/HouseholdSection'))
export default function AuthSection() {
  return (
    <AuthProvider>
      <SessionPanel />
    </AuthProvider>
  )
}
function SessionPanel() {
  const auth = useAuth()
  const previous = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (auth.status === 'loading') return
    const uid = auth.user?.uid ?? null
    if (previous.current !== undefined && previous.current !== uid) resetPage()
    previous.current = uid
  }, [auth.status, auth.user?.uid])
  return (
    <AuthPanel>
      <Suspense fallback={<p role="status">世帯情報を準備中です…</p>}>
        <HouseholdSection />
      </Suspense>
    </AuthPanel>
  )
}
