import { useEffect, useState } from 'react'
import { useHousehold } from '../household/context'
import type { FinanceCategory, FinanceEntry, FinanceType } from './model'
import {
  ensureFinanceCategories,
  watchFinanceCategories,
  watchFinanceEntries,
} from './service'

export function useFinanceCategories() {
  const { uid, household } = useHousehold()
  const householdId = household?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const key = `${uid}:${householdId}:${attempt}`
  const [state, setState] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    categories: FinanceCategory[]
  }>({ key: '', status: 'loading', categories: [] })
  useEffect(() => {
    if (!householdId) return
    let active = true
    let stop: (() => void) | undefined
    void ensureFinanceCategories(householdId, uid)
      .then(() => {
        if (!active) return
        stop = watchFinanceCategories(
          householdId,
          (categories) => {
            if (active) setState({ key, status: 'ready', categories })
          },
          () => {
            if (active) setState({ key, status: 'error', categories: [] })
          },
        )
      })
      .catch(() => {
        if (active) setState({ key, status: 'error', categories: [] })
      })
    return () => {
      active = false
      stop?.()
    }
  }, [householdId, uid, key])
  const current =
    state.key === key ? state : { status: 'loading' as const, categories: [] }
  return { ...current, retry: () => setAttempt((value) => value + 1) }
}

export function useFinanceEntries(
  month: string,
  active = true,
  type?: FinanceType,
) {
  const { uid, household } = useHousehold()
  const householdId = household?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const key = `${uid}:${householdId}:${month}:${attempt}:${active}:${type ?? 'both'}`
  const [state, setState] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    entries: FinanceEntry[]
    complete: boolean
  }>({ key: '', status: 'loading', entries: [], complete: false })
  useEffect(() => {
    if (!householdId || !active) return
    let mounted = true
    const stop = watchFinanceEntries(
      householdId,
      { month, type },
      (entries, complete = true) => {
        if (mounted) setState({ key, status: 'ready', entries, complete })
      },
      () => {
        if (mounted)
          setState({ key, status: 'error', entries: [], complete: false })
      },
    )
    return () => {
      mounted = false
      stop()
    }
  }, [householdId, uid, month, active, type, key])
  if (!active)
    return {
      status: 'ready' as const,
      entries: [] as FinanceEntry[],
      complete: false,
      retry: () => setAttempt((value) => value + 1),
    }
  const current =
    state.key === key
      ? state
      : { status: 'loading' as const, entries: [], complete: false }
  return { ...current, retry: () => setAttempt((value) => value + 1) }
}
