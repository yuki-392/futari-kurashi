import { useEffect, useState } from 'react'
import { useHousehold } from '../household/context'
import type { Budget } from './budgetModel'
import { watchBudgets } from './budgetService'
export function useBudgets(month: string, active = true, totalOnly = false) {
  const { uid, household } = useHousehold(),
    householdId = household?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const key = `${uid}:${householdId}:${month}:${active}:${totalOnly}:${attempt}`
  const [state, setState] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    budgets: Budget[]
    complete: boolean
  }>({ key: '', status: 'loading', budgets: [], complete: false })
  useEffect(() => {
    if (!active || !householdId) return
    let mounted = true
    const stop = watchBudgets(
      householdId,
      month,
      (budgets, complete) => {
        if (mounted) setState({ key, status: 'ready', budgets, complete })
      },
      () => {
        if (mounted)
          setState({ key, status: 'error', budgets: [], complete: false })
      },
      totalOnly,
    )
    return () => {
      mounted = false
      stop()
    }
  }, [key, month, active, totalOnly, householdId])
  const current =
    state.key === key
      ? state
      : { status: 'loading' as const, budgets: [], complete: false }
  return { ...current, retry: () => setAttempt((n) => n + 1) }
}
