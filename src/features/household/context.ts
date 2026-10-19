import { createContext, useContext } from 'react'
import type { Household, Invitation } from './model'
export type HouseholdState = {
  status: 'loading' | 'none' | 'joined' | 'error'
  household: Household | null
}
export type HouseholdContextValue = HouseholdState & {
  uid: string
  email: string
  create: (name: string) => Promise<void>
  issue: (email: string) => Promise<void>
  cancel: () => Promise<void>
  inspect: (code: string) => Promise<Invitation>
  join: (code: string) => Promise<void>
  retry: () => void
}
export const HouseholdContext = createContext<HouseholdContextValue | null>(
  null,
)
export function useHousehold() {
  const value = useContext(HouseholdContext)
  if (!value) throw new Error('HouseholdProviderが必要です。')
  return value
}
