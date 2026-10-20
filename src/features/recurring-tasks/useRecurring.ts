import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { useOnline } from '../tasks/useTasks'
import { watchRecurring, watchUndoTargets } from './service'
import { recurringMessage } from './model'
import type { Completion, Recurring, RecurringQuery } from './model'
export function useRecurring<T extends Recurring | Completion>(
  options: RecurringQuery,
) {
  const { uid, household } = useHousehold(),
    hid = household!.id
  const [attempt, setAttempt] = useState(0),
    kind = options.kind,
    count = options.count,
    today = options.kind === 'today' ? options.today : undefined,
    end = options.kind === 'cleaning' ? options.end : undefined,
    place = options.kind === 'cleaning' ? options.place : undefined
  const key = JSON.stringify([
    uid,
    hid,
    kind,
    count,
    today,
    end,
    place,
    attempt,
  ])
  const [state, setState] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    items: T[]
    more: boolean
  }>({ key: '', status: 'loading', items: [], more: false })
  useEffect(() => {
    let active = true
    const stop = watchRecurring<T>(
      hid,
      kind === 'today'
        ? { kind, count, today: today! }
        : kind === 'cleaning'
          ? { kind, count, end: end!, place: place! }
          : { kind, count },
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
  }, [hid, uid, kind, count, today, end, place, key])
  return {
    ...(state.key === key
      ? state
      : { status: 'loading' as const, items: [], more: false }),
    retry: () => setAttempt((n) => n + 1),
  }
}
export function useUndoTargets(entries: Completion[]) {
  const { uid, household } = useHousehold(),
    hid = household!.id
  const ids = JSON.stringify(
    [
      ...new Set(
        entries
          .filter((item) => item.cancelledAt === null)
          .map((item) => item.scheduleId),
      ),
    ].sort(),
  )
  const key = JSON.stringify([uid, hid, ids])
  const [state, setState] = useState<{
    key: string
    targets: Record<string, Recurring | null>
  }>({ key: '', targets: {} })
  useEffect(() => {
    let active = true
    const stop = watchUndoTargets(
      hid,
      JSON.parse(ids) as string[],
      (targets) => {
        if (active) setState({ key, targets })
      },
    )
    return () => {
      active = false
      stop()
    }
  }, [hid, uid, ids, key])
  return state.key === key ? state.targets : {}
}
export function useRecurringAction() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const lock = useRef(false),
    feedback = useRef<HTMLParagraphElement>(null),
    online = useOnline()
  useEffect(() => {
    if (message) feedback.current?.focus()
  }, [message])
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    if (!online) {
      setMessage('通信を確認し、オンラインに戻ってからもう一度お試しください。')
      return
    }
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(recurringMessage(error))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { busy, message, feedback, run, online }
}
