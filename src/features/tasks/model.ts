export type TaskInput = {
  title: string
  assigneeIds: string[]
  dueDate: string | null
  priority: 'low' | 'medium' | 'high'
}
export type Task = TaskInput & {
  id: string
  completed: boolean
  version: number
  createdBy: string
  updatedBy: string
  createdAt: unknown
  updatedAt: unknown
}
export type TaskQuery = { completed: boolean; count: number; dueDate?: string }
export const priorities = { low: '低', medium: '中', high: '高' } as const
export function validDate(value: string) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}
export function cleanInput(value: TaskInput, members: string[]): TaskInput {
  const title = value.title.trim()
  if (Array.from(title).length < 1 || Array.from(title).length > 100)
    throw new Error('タイトルは1〜100文字で入力してください。')
  if (
    !Array.isArray(value.assigneeIds) ||
    value.assigneeIds.length > 2 ||
    new Set(value.assigneeIds).size !== value.assigneeIds.length ||
    value.assigneeIds.some((id) => !members.includes(id))
  )
    throw new Error('担当は現在の世帯メンバーから選んでください。')
  if (value.dueDate !== null && !validDate(value.dueDate))
    throw new Error('期限は有効な日付で入力してください。')
  if (!Object.hasOwn(priorities, value.priority))
    throw new Error('優先度を選んでください。')
  return {
    title,
    assigneeIds: [...value.assigneeIds],
    dueDate: value.dueDate,
    priority: value.priority,
  }
}
export function assigneeLabel(ids: string[], uid: string) {
  return ids.length === 0
    ? '未担当'
    : ids.length === 2
      ? '2人'
      : ids[0] === uid
        ? '自分'
        : '相手'
}
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export function tokyoDate(now = new Date()) {
  const parts = formatter.formatToParts(now)
  const part = (name: string) => parts.find((p) => p.type === name)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function isOverdue(
  date: string | null,
  completed: boolean,
  today: string,
) {
  return !completed && date !== null && date < today
}
export function taskMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'task-conflict')
    return '別の端末で更新または削除されました。入力を確認し、編集を閉じて最新の内容を開き直してください。'
  if (code === 'permission-denied')
    return '操作できませんでした。ログイン状態と世帯を確認してください。'
  if (
    ['unavailable', 'aborted', 'offline', 'deadline-exceeded'].includes(
      String(code),
    )
  )
    return '通信を確認し、オンラインに戻ってからもう一度お試しください。'
  if (error instanceof Error && !code) return error.message
  return '操作に失敗しました。通信を確認してもう一度お試しください。'
}
