import { useEffect, useState } from 'react'
import { useHousehold } from '../household/context'
import { ensureRuleCategories, watchRuleCollection } from './service'
import type { RuleQuery } from './service'
import type { HouseRule, RuleCategory, RuleHistory } from './model'
export function useRuleData<T extends HouseRule | RuleCategory | RuleHistory>(
  options: RuleQuery,
) {
  const { uid, household } = useHousehold(),
    hid = household?.id ?? ''
  const [attempt, setAttempt] = useState(0),
    queryKey = JSON.stringify(options),
    scope = `${uid}:${hid}:${JSON.stringify({ ...options, count: 0 })}`,
    key = `${scope}:${queryKey}:${attempt}`
  const [state, setState] = useState<{
    key: string
    scope: string
    status: 'loading' | 'ready' | 'error'
    items: T[]
    more: boolean
  }>({ key: '', scope: '', status: 'loading', items: [], more: false })
  useEffect(() => {
    if (!hid) return
    let active = true,
      stop: (() => void) | undefined
    const options = JSON.parse(queryKey) as RuleQuery
    const start = () => {
      if (!active) return
      stop = watchRuleCollection<T>(
        hid,
        options,
        (items, more) => {
          if (active) setState({ key, scope, status: 'ready', items, more })
        },
        () => {
          if (active)
            setState((previous) => ({
              key,
              scope,
              status: 'error',
              items: previous.scope === scope ? previous.items : [],
              more: previous.scope === scope && previous.more,
            }))
        },
      )
    }
    if (options.kind === 'categories')
      void ensureRuleCategories(hid, uid)
        .then(start)
        .catch(() => {
          if (active)
            setState((previous) => ({
              key,
              scope,
              status: 'error',
              items: previous.scope === scope ? previous.items : [],
              more: previous.scope === scope && previous.more,
            }))
        })
    else start()
    return () => {
      active = false
      stop?.()
    }
  }, [hid, uid, key, queryKey, scope])
  return {
    ...(state.key === key
      ? state
      : {
          status: 'loading' as const,
          items: state.scope === scope ? state.items : ([] as T[]),
          more: state.scope === scope && state.more,
        }),
    retry: () => setAttempt((n) => n + 1),
  }
}
