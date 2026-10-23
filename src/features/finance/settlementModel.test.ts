import { describe, expect, it } from 'vitest'
import {
  cleanSharing,
  splitExpense,
  settlementTotals,
  paymentInput,
} from './settlementModel'
const sharing = { payerId: 'a', shares: { a: 50, b: 50 } }
describe('settlements', () => {
  it('uses payer for the rounding remainder, independently of recorder', () => {
    expect(splitExpense(101, sharing)).toEqual({ a: 51, b: 50 })
    expect(
      splitExpense(101, { payerId: 'b', shares: { a: 50, b: 50 } }),
    ).toEqual({ a: 50, b: 51 })
    expect(
      splitExpense(101, { payerId: 'a', shares: { a: 0, b: 100 } }),
    ).toEqual({ a: 0, b: 101 })
    expect(
      splitExpense(999999999, { payerId: 'b', shares: { a: 33, b: 67 } }),
    ).toEqual({ a: 329999999, b: 670000000 })
  })
  it('rejects invalid shares and household outsiders', () => {
    expect(cleanSharing(sharing, ['a', 'b'])).toEqual(sharing)
    for (const s of [
      { payerId: 'c', shares: { a: 50, b: 50 } },
      { payerId: 'a', shares: { a: 49, b: 50 } },
      { payerId: 'a', shares: { a: 0.5, b: 99.5 } },
      { payerId: 'a', shares: { a: -1, b: 101 } },
      { payerId: 'a', shares: { a: 50, c: 50 } },
    ])
      expect(() =>
        cleanSharing(
          s as unknown as { payerId: string; shares: Record<string, number> },
          ['a', 'b'],
        ),
      ).toThrow()
    expect(() => cleanSharing(sharing, ['a'])).toThrow()
    expect(cleanSharing(null, ['a'])).toBeNull()
  })
  it('does not infer payer of legacy entries, or include incomes', () => {
    const result = settlementTotals(
      [
        { type: 'expense', amount: 100, date: '2026-10-01' },
        { type: 'income', amount: 999, date: '2026-10-01', sharing },
      ],
      [],
      'a',
      '2026-10',
    )
    expect(result.base).toBe(0)
  })
  it('preserves base after payments, supports reverse balance, dates and cancellation', () => {
    const entries = [
      { type: 'expense', amount: 101, date: '2026-10-01', sharing },
      { type: 'expense', amount: 200, date: '2026-09-01', sharing },
    ]
    const ledgers = [{ month: '2026-10', netPaid: 70 }]
    expect(settlementTotals(entries, ledgers, 'a', '2026-10')).toMatchObject({
      base: 50,
      remaining: -20,
      paid: { a: 101, b: 0 },
      burden: { a: 51, b: 50 },
    })
    expect(settlementTotals(entries, [], 'a', '2026-10').remaining).toBe(50)
    expect(settlementTotals(entries, ledgers, 'a').remaining).toBe(80)
  })
  it('validates payment positive integer and real date', () => {
    expect(
      paymentInput('2026-10', 'b', 'a', 1, '2026-11-01', ['a', 'b']).amount,
    ).toBe(1)
    for (const amount of [0, -1, 1.1, NaN, Number.MAX_SAFE_INTEGER])
      expect(() =>
        paymentInput('2026-10', 'b', 'a', amount, '2026-11-01', ['a', 'b']),
      ).toThrow()
    expect(() =>
      paymentInput('2026-10', 'b', 'b', 1, '2026-11-01', ['a', 'b']),
    ).toThrow()
    expect(() =>
      paymentInput('2026-10', 'b', 'a', 1, '2026-02-29', ['a', 'b']),
    ).toThrow()
  })
})

it('does not lose yen while opposite monthly payments cancel large intermediate totals', () => {
  const n = 999999999999999
  const ledgers = Array.from({ length: 20 }, (_, i) => ({
    month: `${2000 + i}-01`,
    netPaid: i < 10 ? n : -n,
  }))
  ledgers.splice(10, 0, { month: '2026-10', netPaid: 1 })
  expect(settlementTotals([], ledgers, 'a').remaining).toBe(-1)
  expect(() => settlementTotals([], ledgers.slice(0, 10), 'a')).toThrow(
    '安全に計算',
  )
})
