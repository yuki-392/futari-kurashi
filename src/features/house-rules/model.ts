import { validDate } from '../tasks/model'
export const standardRuleCategories = [
  { id: 'chores', name: '家事' },
  { id: 'money', name: 'お金' },
  { id: 'habits', name: '生活習慣' },
  { id: 'space', name: '共有スペース' },
  { id: 'other', name: 'その他' },
] as const
export type RuleAction =
  'create' | 'edit' | 'agree' | 'withdraw' | 'retire' | 'restore'
export type RuleInput = {
  title: string
  body: string
  categoryId: string
  reviewDate: string | null
}
type Audit = {
  version: number
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}
export type HouseRule = RuleInput &
  Audit & {
    id: string
    categoryName: string
    archived: boolean
    contentVersion: number
    agreedUids: string[]
    lastAction: RuleAction
  }
export type RuleCategory = Audit & {
  id: string
  name: string
  archived: boolean
  standard: boolean
}
export type RuleHistory = { id: string; snapshot: Omit<HouseRule, 'id'> }
export function cleanRuleInput(input: RuleInput): RuleInput {
  const title = input.title.trim(),
    body = input.body.trim()
  if (Array.from(title).length < 1 || Array.from(title).length > 100)
    throw new Error('タイトルは1〜100文字で入力してください。')
  if (Array.from(body).length < 1 || Array.from(body).length > 2000)
    throw new Error('内容は1〜2000文字で入力してください。')
  if (!input.categoryId) throw new Error('カテゴリを選んでください。')
  if (input.reviewDate !== null && !validDate(input.reviewDate))
    throw new Error('実在する見直し日を入力してください。')
  return {
    title,
    body,
    categoryId: input.categoryId,
    reviewDate: input.reviewDate,
  }
}
export function ruleChange(
  current: HouseRule,
  action: Exclude<RuleAction, 'create'>,
  uid: string,
  members: string[],
  input?: RuleInput,
): HouseRule | null {
  if (!members.includes(uid)) throw new Error('世帯の所属を確認してください。')
  if (current.archived ? action !== 'restore' : action === 'restore')
    throw new Error('ルールの最新の状態を確認してください。')
  if (
    !Number.isSafeInteger(current.version + 1) ||
    !Number.isSafeInteger(current.contentVersion + 1)
  )
    throw new Error('更新回数が上限に達しました。')
  const next = { ...current, version: current.version + 1, lastAction: action }
  if (action === 'edit' || action === 'restore') {
    if (!input) throw new Error('内容を確認してください。')
    return {
      ...next,
      ...cleanRuleInput(input),
      archived: false,
      contentVersion: current.contentVersion + 1,
      agreedUids: [],
    }
  }
  if (action === 'retire') return { ...next, archived: true }
  if (action === 'agree')
    return current.agreedUids.includes(uid)
      ? null
      : { ...next, agreedUids: [...current.agreedUids, uid].sort() }
  return current.agreedUids.includes(uid)
    ? { ...next, agreedUids: current.agreedUids.filter((id) => id !== uid) }
    : null
}
export function reviewDue(date: string | null, today: string) {
  return date !== null && date <= today
}
export function ruleMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'rule-conflict')
    return '別の端末で変更されました。入力は保持しています。編集を閉じて最新の内容を確認してください。'
  if (code === 'offline')
    return 'オフラインです。通信を戻してから再試行してください。'
  if (code === 'permission-denied')
    return '操作できませんでした。アプリを更新してログイン状態を確認してください。'
  return error instanceof Error && !code
    ? error.message
    : '取得・保存できませんでした。通信を確認して再試行してください。'
}
export function ruleTime(value: unknown) {
  return value && typeof value === 'object' && 'toDate' in value
    ? (value as { toDate(): Date })
        .toDate()
        .toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    : '日時確認中'
}
export const actionLabels: Record<RuleAction, string> = {
  create: '追加',
  edit: '編集',
  agree: '合意',
  withdraw: '合意取消',
  retire: '廃止',
  restore: '再開',
}
