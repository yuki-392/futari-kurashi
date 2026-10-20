import { useAuth } from '../auth/context'
import { HouseholdProvider } from './HouseholdProvider'
import { HouseholdGate } from './HouseholdGate'
export default function HouseholdSection() {
  const auth = useAuth()
  if (auth.status !== 'signedIn' || !auth.user) return null
  return (
    <HouseholdProvider
      key={auth.user.uid}
      uid={auth.user.uid}
      email={auth.user.email ?? ''}
    >
      <HouseholdGate />
    </HouseholdProvider>
  )
}
