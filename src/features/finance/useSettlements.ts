import { useEffect, useState } from 'react'
import { useHousehold } from '../household/context'
import { watchSettlements } from './settlementService'
import type { SettlementData } from './settlementService'
export function useSettlements(month: string) {
  const { uid, household } = useHousehold()
  const hid = household?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const key = `${uid}:${hid}:${month}:${attempt}`
  const [state, setState] = useState<
    SettlementData & { key: string; status: 'ready' | 'loading' | 'error' }
  >({
    key: '',
    status: 'loading',
    expenses: [],
    months: [],
    payments: [],
    complete: false,
  })
  useEffect(() => {
    if (!hid) return
    return watchSettlements(
      hid,
      month,
      (data) => setState({ ...data, key, status: 'ready' }),
      () =>
        setState({
          key,
          status: 'error',
          expenses: [],
          months: [],
          payments: [],
          complete: false,
        }),
    )
  }, [hid, key, month])
  return {
    ...(state.key === key
      ? state
      : {
          status: 'loading' as const,
          expenses: [],
          months: [],
          payments: [],
          complete: false,
        }),
    retry: () => setAttempt((n) => n + 1),
  }
}
