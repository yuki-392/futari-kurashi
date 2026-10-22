import { describe, expect, it } from 'vitest'
import {
  cleanFinanceEntry,
  financeMessage,
  formatYen,
  monthBounds,
  monthTotals,
  standardCategories,
} from './model'

describe('finance model', () => {
  it('収入・支出の標準カテゴリを定義する', () => {
    expect(standardCategories.income.map((item) => item.name)).toEqual([
      '給与',
      '賞与',
      'その他',
    ])
    expect(standardCategories.expense.map((item) => item.name)).toEqual([
      '食費',
      '日用品',
      '住居費',
      '水道光熱費',
      '通信費',
      '交通費',
      '家具家電',
      '医療',
      '娯楽',
      'その他',
    ])
  })

  it('明細を正規化し、金額・日付・文字数・種別を検証する', () => {
    const value = cleanFinanceEntry(
      {
        type: 'expense',
        title: ' 食料品 ',
        amount: 12345,
        date: '2026-10-21',
        categoryId: 'food',
        memo: ' 週末分 ',
      },
      [{ id: 'food', type: 'expense', name: '食費', archived: false }],
    )
    expect(value).toEqual({
      type: 'expense',
      title: '食料品',
      amount: 12345,
      date: '2026-10-21',
      categoryId: 'food',
      memo: '週末分',
    })

    for (const amount of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        cleanFinanceEntry(
          {
            type: 'income',
            title: '収入',
            amount,
            date: '2026-10-21',
            categoryId: 'salary',
            memo: '',
          },
          [{ id: 'salary', type: 'income', name: '給与', archived: false }],
        ),
      ).toThrow()

    for (const patch of [
      { title: '' },
      { title: 'x'.repeat(101) },
      { date: '2026-02-29' },
      { date: '2026-10-32' },
      { date: '' },
      { type: 'other' },
      { categoryId: 'archived' },
      { memo: 'x'.repeat(501) },
    ])
      expect(() =>
        cleanFinanceEntry(
          {
            type: 'income',
            title: '収入',
            amount: 1,
            date: '2026-10-21',
            categoryId: 'salary',
            memo: '',
            ...patch,
          } as never,
          [
            { id: 'salary', type: 'income', name: '給与', archived: false },
            {
              id: 'archived',
              type: 'income',
              name: '旧カテゴリ',
              archived: true,
            },
          ],
        ),
      ).toThrow()
  })

  it('既存明細はアーカイブ済みカテゴリ名で表示できる', () => {
    expect(() =>
      cleanFinanceEntry(
        {
          type: 'expense',
          title: '過去の明細',
          amount: 100,
          date: '2026-10-01',
          categoryId: 'old',
          memo: '',
        },
        [{ id: 'old', type: 'expense', name: '旧食費', archived: true }],
        true,
      ),
    ).not.toThrow()
  })

  it('月境界、月ごとの収支合計、円表示を扱う', () => {
    expect(monthBounds('2024-02')).toEqual({
      from: '2024-02-01',
      through: '2024-02-29',
    })
    expect(monthBounds('2026-12')).toEqual({
      from: '2026-12-01',
      through: '2026-12-31',
    })
    expect(
      monthTotals([
        { type: 'income', amount: 300000 },
        { type: 'expense', amount: 1200 },
        { type: 'expense', amount: 8800 },
      ]),
    ).toEqual({ income: 300000, expense: 10000 })
    expect(formatYen(12345)).toBe('12,345円')
  })

  it('競合・オフラインの失敗を利用者向けに案内する', () => {
    expect(
      financeMessage(Object.assign(new Error(), { code: 'finance-conflict' })),
    ).toContain('別の端末')
    expect(
      financeMessage(Object.assign(new Error(), { code: 'offline' })),
    ).toContain('オンライン')
  })
})
