import type { Sharing } from './settlementModel'
export type FinanceType = 'income' | 'expense'

export const standardCategories: Record<
  FinanceType,
  readonly { id: string; name: string }[]
> = {
  income: [
    { id: 'income_salary', name: '給与' },
    { id: 'income_bonus', name: '賞与' },
    { id: 'income_other', name: 'その他' },
  ],
  expense: [
    { id: 'expense_food', name: '食費' },
    { id: 'expense_daily', name: '日用品' },
    { id: 'expense_housing', name: '住居費' },
    { id: 'expense_utilities', name: '水道光熱費' },
    { id: 'expense_communication', name: '通信費' },
    { id: 'expense_transport', name: '交通費' },
    { id: 'expense_furniture', name: '家具家電' },
    { id: 'expense_medical', name: '医療' },
    { id: 'expense_entertainment', name: '娯楽' },
    { id: 'expense_other', name: 'その他' },
  ],
}

export type FinanceCategory = {
  id: string
  type: FinanceType
  name: string
  archived: boolean
  standard: boolean
  version: number
  createdAt?: unknown
  createdBy?: string
  updatedAt?: unknown
  updatedBy?: string
}

export type FinanceEntryInput = {
  type: FinanceType
  title: string
  amount: number
  date: string
  categoryId: string
  memo: string
  sharing?: Sharing | null
}

export type FinanceEntry = FinanceEntryInput & {
  id: string
  version: number
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}

export type FinanceEntryQuery = { month: string; type?: FinanceType }

const isDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return (
    year! >= 1000 &&
    year! <= 9999 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  )
}

export function cleanFinanceEntry(
  value: FinanceEntryInput,
  categories: Pick<FinanceCategory, 'id' | 'type' | 'name' | 'archived'>[],
  allowArchived = false,
): FinanceEntryInput {
  const title = value.title.trim()
  const memo = value.memo.trim()
  if (value.type !== 'income' && value.type !== 'expense')
    throw new Error('収入または支出を選んでください。')
  if (Array.from(title).length < 1 || Array.from(title).length > 100)
    throw new Error('内容は1〜100文字で入力してください。')
  if (
    !Number.isSafeInteger(value.amount) ||
    value.amount < 1 ||
    value.amount > 999999999
  )
    throw new Error('金額は1〜999999999円の整数で入力してください。')
  if (!isDay(value.date)) throw new Error('実在する日付を入力してください。')
  if (Array.from(memo).length > 500)
    throw new Error('メモは500文字以内で入力してください。')
  const category = categories.find((item) => item.id === value.categoryId)
  if (
    !category ||
    category.type !== value.type ||
    (category.archived && !allowArchived)
  )
    throw new Error('利用できるカテゴリを選んでください。')
  return {
    type: value.type,
    title,
    amount: value.amount,
    date: value.date,
    categoryId: value.categoryId,
    memo,
    ...(value.type === 'expense' && value.sharing !== undefined
      ? { sharing: value.sharing }
      : {}),
  }
}

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error('対象月を確認してください。')
  const [year, monthNumber] = month.split('-').map(Number)
  if (year! < 1000 || year! > 9999)
    throw new Error('対象月を確認してください。')
  const last = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate()
  return {
    from: `${month}-01`,
    through: `${month}-${String(last).padStart(2, '0')}`,
  }
}

export function monthTotals(entries: Pick<FinanceEntry, 'type' | 'amount'>[]) {
  return entries.reduce(
    (totals, entry) => {
      totals[entry.type] += entry.amount
      return totals
    },
    { income: 0, expense: 0 },
  )
}

export function formatYen(amount: number) {
  return `${new Intl.NumberFormat('ja-JP').format(amount)}円`
}

export function financeMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'finance-conflict')
    return '別の端末で変更・削除されました。入力は残しています。最新の内容を確認して再度操作してください。'
  if (code === 'permission-denied')
    return '操作できませんでした。アプリを更新し、ログイン状態を確認してください。'
  if (code === 'offline')
    return 'オフラインです。オンラインに戻してからもう一度お試しください。'
  if (error instanceof Error && !code) return error.message
  return '通信を確認して、もう一度お試しください。'
}
