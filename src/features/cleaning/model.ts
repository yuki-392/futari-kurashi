import { nextDate } from '../recurring-tasks/model'
import type { Recurring } from '../recurring-tasks/model'
export type CleaningFields = {
  taskType?: 'general' | 'cleaning'
  place?: string
  rotation?: 'fixed' | 'alternate'
}
export function cleaningFields(value: CleaningFields) {
  return {
    taskType: value.taskType ?? 'general',
    place: value.place ?? '',
    rotation: value.rotation ?? 'fixed',
  } as const
}
export function rotatedAssignees(
  value: CleaningFields & { assigneeIds: string[] },
  members: string[],
) {
  if (value.rotation !== 'alternate') return value.assigneeIds
  if (
    members.length !== 2 ||
    value.assigneeIds.length !== 1 ||
    !members.includes(value.assigneeIds[0]!)
  )
    throw new Error('交代は2人の世帯で担当1人の場合に設定してください。')
  return members.filter((id) => !value.assigneeIds.includes(id))
}
export function addDays(value: string, n: number) {
  const d = new Date(`${value}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function weekBounds(today: string) {
  const start = addDays(
    today,
    -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7),
  )
  return { start, end: addDays(start, 6) }
}
export function cleaningOccurrences(
  value: Recurring,
  today: string,
  end: string,
  members: string[],
) {
  const entries: { date: string; reference: boolean; assigneeIds: string[] }[] =
    []
  if (!value.active || value.nextDueDate > end) return entries
  let date = value.nextDueDate,
    assigneeIds = value.assigneeIds
  entries.push({ date, reference: false, assigneeIds })
  // Only the current pending occurrence exists; assume it is completed today if overdue.
  for (let i = 0; i < 7; i++) {
    try {
      date = nextDate(
        { ...value, nextDueDate: date },
        date < today ? today : date,
      )
    } catch {
      break
    }
    if (date > end) break
    assigneeIds = rotatedAssignees({ ...value, assigneeIds }, members)
    entries.push({ date, reference: true, assigneeIds })
  }
  return entries
}
