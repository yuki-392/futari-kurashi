import type { CleaningFields } from '../cleaning/model'
import { cleanInput, validDate } from '../tasks/model'
import type { TaskInput } from '../tasks/model'
export const frequencies = {
  daily: '毎日',
  weekly: '毎週',
  monthly: '毎月',
} as const
export type RecurringInput = Omit<TaskInput, 'dueDate'> &
  CleaningFields & {
    frequency: keyof typeof frequencies
    startDate: string
    nextDueDate: string
  }
export type Recurring = RecurringInput & {
  id: string
  active: boolean
  version: number
  lastCompletionId: string | null
  lastAction: 'create' | 'edit' | 'pause' | 'resume' | 'complete' | 'undo'
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}
export type Completion = Omit<RecurringInput, 'nextDueDate'> & {
  id: string
  scheduleId: string
  scheduleVersion: number
  scheduledDate: string
  nextDueDate: string
  completedAt: unknown
  completedBy: string
  cancelledAt: unknown | null
  cancelledBy: string | null
}
export type RecurringQuery =
  | { kind: 'today'; today: string; count: number }
  | { kind: 'definitions' | 'history'; count: number }
  | { kind: 'cleaning'; end: string; place: string; count: number }
const dayMs = 86400000
const date = (value: string) => new Date(`${value}T00:00:00Z`)
function format(value: Date) {
  const result = value.toISOString().slice(0, 10)
  if (!validDate(result))
    throw new Error(
      '次回予定の日付が扱える範囲を超えています。設定を確認してください。',
    )
  return result
}
function monthDate(year: number, month: number, day: number) {
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()),
    ),
  )
}
export function nextDate(
  value: Pick<RecurringInput, 'frequency' | 'startDate' | 'nextDueDate'>,
  today: string,
) {
  const base = date(value.nextDueDate > today ? value.nextDueDate : today),
    anchor = date(value.startDate)
  if (value.frequency === 'daily')
    return format(new Date(base.getTime() + dayMs))
  if (value.frequency === 'weekly') {
    const gap = (anchor.getUTCDay() - base.getUTCDay() + 7) % 7 || 7
    return format(new Date(base.getTime() + gap * dayMs))
  }
  const candidate = monthDate(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    anchor.getUTCDate(),
  )
  return format(
    candidate > base
      ? candidate
      : monthDate(
          base.getUTCFullYear(),
          base.getUTCMonth() + 1,
          anchor.getUTCDate(),
        ),
  )
}
export function validateRecurring(
  value: RecurringInput,
  members: string[],
): RecurringInput {
  const task = cleanInput({ ...value, dueDate: value.startDate }, members)
  if (!Object.hasOwn(frequencies, value.frequency))
    throw new Error('頻度を選んでください。')
  if (
    !validDate(value.startDate) ||
    !validDate(value.nextDueDate) ||
    value.nextDueDate < value.startDate
  )
    throw new Error('開始日と次回予定に有効な日付を指定してください。')
  const anchor = date(value.startDate),
    due = date(value.nextDueDate)
  if (value.frequency === 'weekly' && anchor.getUTCDay() !== due.getUTCDay())
    throw new Error('次回予定は開始日と同じ曜日を選んでください。')
  if (
    value.frequency === 'monthly' &&
    format(
      monthDate(due.getUTCFullYear(), due.getUTCMonth(), anchor.getUTCDate()),
    ) !== value.nextDueDate
  )
    throw new Error(
      '次回予定は開始日の日付（存在しない月は末日）を選んでください。',
    )
  const place = (value.place ?? '').trim()
  const rotation = value.rotation ?? 'fixed'
  if (place.length > 40 || /[\r\n\t]/.test(place))
    throw new Error('掃除場所は1〜40文字で入力してください。')
  if (!['fixed', 'alternate'].includes(rotation))
    throw new Error('担当交代の設定を確認してください。')
  if (
    rotation === 'alternate' &&
    (members.length !== 2 || task.assigneeIds.length !== 1)
  )
    throw new Error('交代は2人の世帯で担当1人の場合に設定してください。')
  return {
    taskType: place ? 'cleaning' : 'general',
    place,
    rotation,
    title: task.title,
    assigneeIds: task.assigneeIds,
    priority: task.priority,
    frequency: value.frequency,
    startDate: value.startDate,
    nextDueDate: value.nextDueDate,
  }
}
export function historyId(id: string, version: number) {
  return `${id}_${version}`
}
export function recurringMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'recurring-conflict')
    return '別の端末で更新されたか、この完了は取り消せません。最新の内容を確認して操作し直してください。編集中の入力は残しています。'
  if (code === 'permission-denied')
    return '操作できませんでした。アプリを更新し、日付・時刻とログイン状態を確認して再試行してください。'
  if (error instanceof Error && !code) return error.message
  return '通信を確認し、オンラインに戻ってからもう一度お試しください。'
}
export function formatTimestamp(value: unknown) {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  )
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value.toDate())
  return '日時を確認中'
}
