import { useEffect, useState } from 'react'
import { useHousehold } from '../household/context'
import { watchTasks } from './service'
import type { Task, TaskQuery } from './model'
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}
export function useTasks(options: TaskQuery) {
  const { uid, household } = useHousehold()
  const id = household?.id ?? ''
  const [attempt, setAttempt] = useState(0)
  const { completed, count, dueDate } = options
  const key = JSON.stringify([uid, id, completed, count, dueDate, attempt])
  const [state, setState] = useState<{
    key: string
    status: 'loading' | 'ready' | 'error'
    tasks: Task[]
    more: boolean
  }>({ key: '', status: 'loading', tasks: [], more: false })
  useEffect(() => {
    if (!id) return
    let active = true
    const stop = watchTasks(
      id,
      { completed, count, ...(dueDate ? { dueDate } : {}) },
      (tasks, more) => {
        if (active) setState({ key, status: 'ready', tasks, more })
      },
      () => {
        if (active) setState({ key, status: 'error', tasks: [], more: false })
      },
    )
    return () => {
      active = false
      stop()
    }
  }, [id, uid, completed, count, dueDate, key])
  const current =
    state.key === key
      ? state
      : { status: 'loading' as const, tasks: [], more: false }
  return { ...current, retry: () => setAttempt((n) => n + 1) }
}
