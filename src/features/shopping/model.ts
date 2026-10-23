export const categories = {
  food: '食品',
  daily: '日用品',
  furniture: '家具',
  appliances: '家電',
  other: 'その他',
} as const
export const shoppingPriorities = { 1: '低', 2: '中', 3: '高' } as const
export type ShoppingInput = {
  title: string
  category: keyof typeof categories
  quantity: string
  unit: string
  budget: number | null
  assigneeIds: string[]
  priority: 1 | 2 | 3
}
export type ShoppingItem = ShoppingInput & {
  id: string
  purchased: boolean
  expenseId?: string
  version: number
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}
export type ShoppingQuery = {
  purchased: boolean
  count: number
  category?: keyof typeof categories
}
export function normalizeQuantity(value: string) {
  const text = value.trim()
  if (!/^\d+(\.\d{1,3})?$/.test(text))
    throw new Error('数量は正の数で、小数3桁まで入力してください。')
  const [integer, fraction = ''] = text.split('.'),
    whole = integer!.replace(/^0+(?=\d)/, ''),
    part = fraction.replace(/0+$/, '')
  if (whole.length > 6 || (whole === '0' && !part))
    throw new Error('数量は0より大きく999999.999以下にしてください。')
  return whole + (part ? '.' + part : '')
}
export function parseBudget(value: string) {
  const text = value.trim()
  if (!text) return null
  if (!/^\d+$/.test(text) || Number(text) > 999999999)
    throw new Error('予算は0〜999999999円の整数で入力してください。')
  return Number(text)
}
export function cleanShoppingInput(
  value: ShoppingInput,
  members: string[],
): ShoppingInput {
  const title = value.title.trim(),
    unit = value.unit.trim()
  if (Array.from(title).length < 1 || Array.from(title).length > 100)
    throw new Error('商品名は1〜100文字で入力してください。')
  if (Array.from(unit).length > 10)
    throw new Error('単位は10文字以内で入力してください。')
  if (!Object.hasOwn(categories, value.category))
    throw new Error('カテゴリを選んでください。')
  if (![1, 2, 3].includes(value.priority))
    throw new Error('優先度を選んでください。')
  if (
    value.budget !== null &&
    (!Number.isInteger(value.budget) ||
      value.budget < 0 ||
      value.budget > 999999999)
  )
    throw new Error('予算は0〜999999999円の整数で入力してください。')
  if (
    !Array.isArray(value.assigneeIds) ||
    value.assigneeIds.length > 2 ||
    new Set(value.assigneeIds).size !== value.assigneeIds.length ||
    value.assigneeIds.some((id) => !members.includes(id))
  )
    throw new Error('担当は現在の世帯メンバーから選んでください。')
  return {
    title,
    unit,
    category: value.category,
    quantity: normalizeQuantity(value.quantity),
    budget: value.budget,
    assigneeIds: [...value.assigneeIds],
    priority: value.priority,
  }
}
export function shoppingMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'shopping-conflict')
    return '別の端末で更新・削除されました。入力は残しています。編集を閉じて最新の内容を確認してください。'
  if (code === 'permission-denied')
    return '操作できませんでした。アプリを更新し、ログイン状態を確認して再試行してください。'
  if (error instanceof Error && !code) return error.message
  return '通信を確認し、オンラインに戻ってからもう一度お試しください。'
}
