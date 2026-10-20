import { useEffect, useState } from 'react'
import { useHousehold } from '../household/context'
import { watchDeclutter } from './service'
import type { DeclutterItem, DeclutterQuery } from './model'
export function useDeclutter(options: DeclutterQuery) {
  const { uid, household } = useHousehold()
  const id = household?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const { completed, count, method, through } = options
  const key = JSON.stringify([
    uid,
    id,
    completed,
    count,
    method,
    through,
    attempt,
  ])
  const [state, setState] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    items: DeclutterItem[]
    more: boolean
  }>({ key: '', status: 'loading', items: [], more: false })
  useEffect(() => {
    if (!id) return
    let active = true
    const stop = watchDeclutter(
      id,
      {
        completed,
        count,
        ...(method ? { method } : {}),
        ...(through ? { through } : {}),
      },
      (items, more) => {
        if (active) setState({ key, status: 'ready', items, more })
      },
      () => {
        if (active) setState({ key, status: 'error', items: [], more: false })
      },
    )
    return () => {
      active = false
      stop()
    }
  }, [id, uid, completed, count, method, through, key])
  const current =
    state.key === key
      ? state
      : { status: 'loading' as const, items: [], more: false }
  return { ...current, retry: () => setAttempt((n) => n + 1) }
}
