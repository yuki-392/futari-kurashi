import { useAuth } from '../auth/context'
import { HouseholdProvider } from './HouseholdProvider'
import { HouseholdPanel } from './HouseholdPanel'
export default function HouseholdSection() {
  const auth = useAuth()
  if (auth.status !== 'signedIn' || !auth.user) return null
  return (
    <HouseholdProvider
      key={auth.user.uid}
      uid={auth.user.uid}
      email={auth.user.email ?? ''}
    >
      <HouseholdPanel />
    </HouseholdProvider>
  )
}
