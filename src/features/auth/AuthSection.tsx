import { AuthProvider } from './AuthProvider'
import { AuthPanel } from './AuthPanel'
import { lazy, Suspense } from 'react'
const HouseholdSection = lazy(() => import('../household/HouseholdSection'))
export default function AuthSection() {
  return (
    <AuthProvider>
      <AuthPanel>
        <Suspense fallback={<p role="status">世帯情報を準備中です…</p>}>
          <HouseholdSection />
        </Suspense>
      </AuthPanel>
    </AuthProvider>
  )
}
