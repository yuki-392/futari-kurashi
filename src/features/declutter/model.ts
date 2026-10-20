import { assigneeLabel, validDate } from '../tasks/model'
export const methods = {
  discard: '捨てる',
  sell: '売る',
  give: '譲る',
  hold: '保留',
} as const
export type DeclutterInput = {
  title: string
  method: keyof typeof methods
  ownerIds: string[]
  dueDate: string | null
}
export type Completion = {
  completed: boolean
  completedAt: unknown
  completedBy: string | null
}
export type DeclutterItem = DeclutterInput &
  Completion & {
    id: string
    sortDueDate: string
    version: number
    createdAt: unknown
    createdBy: string
    updatedAt: unknown
    updatedBy: string
  }
export type DeclutterQuery = {
  completed: boolean
  count: number
  method?: DeclutterInput['method']
  through?: string
}
export function cleanDeclutterInput(
  value: DeclutterInput,
  members: string[],
): DeclutterInput {
  const title = value.title.trim()
  if (Array.from(title).length < 1 || Array.from(title).length > 100)
    throw new Error('品名は1〜100文字で入力してください。')
  if (!Object.hasOwn(methods, value.method))
    throw new Error('処分方法を選んでください。')
  if (value.dueDate !== null && !validDate(value.dueDate))
    throw new Error('期限は実在する日付を入力してください。')
  if (
    !Array.isArray(value.ownerIds) ||
    value.ownerIds.length > 2 ||
    new Set(value.ownerIds).size !== value.ownerIds.length ||
    value.ownerIds.some((id) => !members.includes(id))
  )
    throw new Error('所有者は現在の世帯メンバーから選んでください。')
  return {
    title,
    method: value.method,
    ownerIds: [...value.ownerIds],
    dueDate: value.dueDate,
  }
}
export function ownerLabel(ids: string[], uid: string) {
  return ids.length ? assigneeLabel(ids, uid) : '未設定'
}
export function completionChange(
  current: Completion,
  completed: boolean,
  method: DeclutterInput['method'],
  uid: string,
  time: unknown,
): Completion {
  if (completed && method === 'hold')
    throw new Error(
      current.completed
        ? '保留へ変更する前に、未処分へ戻してください。'
        : '処分方法を捨てる・売る・譲るへ変更してから完了してください。',
    )
  if (!completed)
    return { completed: false, completedAt: null, completedBy: null }
  return current.completed
    ? {
        completed: true,
        completedAt: current.completedAt,
        completedBy: current.completedBy,
      }
    : { completed: true, completedAt: time, completedBy: uid }
}
export function completionLabel(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('toDate' in value) ||
    typeof value.toDate !== 'function'
  )
    return '確認中'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value.toDate())
}
export function declutterMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'declutter-conflict')
    return '別の端末で更新・削除されました。入力は残しています。編集を閉じて最新の内容を確認してください。'
  if (code === 'permission-denied')
    return '操作できませんでした。アプリを更新し、ログイン状態を確認して再試行してください。'
  if (error instanceof Error && !code) return error.message
  return '通信を確認し、オンラインに戻ってからもう一度お試しください。'
}
