import { expect, it } from 'vitest'
import {
  budgetId,
  parseBudgetAmount,
  previousMonth,
  budgetBalance,
  expenseTotals,
  copyTargets,
} from './budgetModel'

it('月/対象のID、年越し、未設定と0円、整数円の境界を扱う', () => {
  expect(budgetId('2026-10', null)).toBe('2026-10__total')
  expect(budgetId('2026-10', 'expense_food')).toBe(
    '2026-10__category__expense_food',
  )
  expect(previousMonth('2026-01')).toBe('2025-12')
  for (const value of ['0', '999999999', ' 12 '])
    expect(parseBudgetAmount(value)).toBe(Number(value))
  for (const value of ['', '-1', '1.1', '1e3', '1000000000', 'Infinity'])
    expect(() => parseBudgetAmount(value)).toThrow()
  for (const month of ['2026-13', '2026-1', '0999-01'])
    expect(() => budgetId(month, null)).toThrow()
  expect(budgetBalance(null, 10)).toBe('予算未設定')
  expect(budgetBalance(0, 10)).toBe('10円超過')
  expect(budgetBalance(100, 10)).toBe('残り90円')
})
it('支出だけを集計し、コピーは有効な支出カテゴリと全体を対象にする', () => {
  expect(
    expenseTotals([
      { type: 'income', amount: 500, categoryId: 'salary' },
      { type: 'expense', amount: 20, categoryId: 'food' },
      { type: 'expense', amount: 10, categoryId: 'food' },
    ]),
  ).toEqual({ total: 30, categories: { food: 30 } })
  expect(
    copyTargets(
      [
        { categoryId: null, amount: 0 },
        { categoryId: 'food', amount: 100 },
        { categoryId: 'old', amount: 200 },
        { categoryId: 'salary', amount: 400 },
      ],
      [
        { id: 'food', type: 'expense', archived: false },
        { id: 'old', type: 'expense', archived: true },
        { id: 'salary', type: 'income', archived: false },
      ],
    ),
  ).toEqual([
    { categoryId: null, amount: 0 },
    { categoryId: 'food', amount: 100 },
  ])
})
