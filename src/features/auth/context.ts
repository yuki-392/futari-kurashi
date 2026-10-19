import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'
export type AuthState = {
  status: 'loading' | 'signedOut' | 'unverified' | 'signedIn' | 'error'
  user: User | null
}
export type AuthActions = {
  register: (email: string, password: string) => Promise<string>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  resend: () => Promise<string>
  verify: () => Promise<string>
  reset: (email: string) => Promise<string>
  retry: () => void
}
export const AuthContext = createContext<(AuthState & AuthActions) | null>(null)
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProviderが必要です。')
  return auth
}
