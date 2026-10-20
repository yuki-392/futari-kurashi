import { useEffect, useState } from 'react'
import { useHousehold } from '../household/context'
import { watchShopping } from './service'
import type { ShoppingItem, ShoppingQuery } from './model'
export function useShopping(options: ShoppingQuery) {
  const { uid, household } = useHousehold()
  const id = household?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const { purchased, count, category } = options
  const key = JSON.stringify([uid, id, purchased, count, category, attempt])
  const [state, setState] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    items: ShoppingItem[]
    more: boolean
  }>({ key: '', status: 'loading', items: [], more: false })
  useEffect(() => {
    if (!id) return
    let active = true
    const stop = watchShopping(
      id,
      { purchased, count, ...(category ? { category } : {}) },
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
  }, [id, uid, purchased, count, category, key])
  const current =
    state.key === key
      ? state
      : { status: 'loading' as const, items: [], more: false }
  return { ...current, retry: () => setAttempt((n) => n + 1) }
}
