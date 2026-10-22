import { formatYen, monthBounds } from './model'
import type { FinanceCategory, FinanceEntry } from './model'

export type Budget = {
  id: string
  month: string
  scope: 'total' | 'category'
  categoryId: string | null
  amount: number
  version: number
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}
export const BUDGET_LIMIT = 100
export const ENTRY_LIMIT = 10000
export function budgetId(month: string, categoryId: string | null) {
  monthBounds(month)
  if (
    categoryId !== null &&
    (!categoryId || categoryId.includes('/') || categoryId.length > 128)
  )
    throw new Error('カテゴリを確認してください。')
  return `${month}__${categoryId === null ? 'total' : `category__${categoryId}`}`
}
export function parseBudgetAmount(value: string) {
  const clean = value.trim()
  if (!/^[0-9]+$/.test(clean) || Number(clean) > 999999999)
    throw new Error('予算は0〜999999999円の整数で入力してください。')
  return Number(clean)
}
export function previousMonth(month: string) {
  monthBounds(month)
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year!, number! - 2, 1))
  const result = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  monthBounds(result)
  return result
}
export function budgetBalance(amount: number | null, expense: number) {
  if (amount === null) return '予算未設定'
  const balance = amount - expense
  return balance < 0
    ? `${formatYen(-balance)}超過`
    : `残り${formatYen(balance)}`
}
export function expenseTotals(
  entries: Pick<FinanceEntry, 'type' | 'categoryId' | 'amount'>[],
) {
  return entries.reduce(
    (sum, entry) => {
      if (entry.type === 'expense') {
        sum.total += entry.amount
        sum.categories[entry.categoryId] =
          (sum.categories[entry.categoryId] ?? 0) + entry.amount
      }
      return sum
    },
    { total: 0, categories: {} as Record<string, number> },
  )
}
export function copyTargets<
  T extends { categoryId: string | null; amount: number },
>(
  budgets: T[],
  categories: Pick<FinanceCategory, 'id' | 'type' | 'archived'>[],
) {
  return budgets.filter(
    (item) =>
      item.categoryId === null ||
      categories.some(
        (c) => c.id === item.categoryId && c.type === 'expense' && !c.archived,
      ),
  )
}
