import { AuthProvider } from './AuthProvider'
import { AuthPanel } from './AuthPanel'
export default function AuthSection() {
  return (
    <AuthProvider>
      <AuthPanel />
    </AuthProvider>
  )
}
