import { useEffect, useState } from 'react'
import { tokyoDate } from './model'
export function useTokyoDay() {
  const [today, setToday] = useState(() => tokyoDate())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function update() {
      clearTimeout(timer)
      const date = tokyoDate()
      setToday(date)
      const delay =
        new Date(`${date}T00:00:00+09:00`).getTime() +
        86400000 -
        Date.now() +
        50
      timer = setTimeout(update, Math.max(50, delay))
    }
    function visible() {
      if (document.visibilityState === 'visible') update()
    }
    update()
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('focus', update)
      window.removeEventListener('online', update)
    }
  }, [])
  return today
}
