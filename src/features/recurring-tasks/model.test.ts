import { expect, it } from 'vitest'
import { nextDate, validateRecurring, historyId } from './model'
const input = {
  title: '掃除',
  assigneeIds: ['a'],
  priority: 'medium' as const,
  frequency: 'weekly' as const,
  startDate: '2026-10-19',
  nextDueDate: '2026-10-19',
}
it('元の周期に沿って日/週/月を進め、持ち越しや早めの完了にも対応する', () => {
  expect(nextDate({ ...input, frequency: 'daily' }, '2026-10-22')).toBe(
    '2026-10-23',
  )
  expect(nextDate(input, '2026-10-22')).toBe('2026-10-26')
  expect(nextDate(input, '2026-10-19')).toBe('2026-10-26')
  expect(nextDate({ ...input, nextDueDate: '2026-10-26' }, '2026-10-19')).toBe(
    '2026-11-02',
  )
  const month = {
    ...input,
    frequency: 'monthly' as const,
    startDate: '2027-01-31',
    nextDueDate: '2027-01-31',
  }
  expect(nextDate(month, '2027-01-31')).toBe('2027-02-28')
  expect(nextDate({ ...month, nextDueDate: '2027-02-28' }, '2027-02-28')).toBe(
    '2027-03-31',
  )
  expect(nextDate({ ...month, nextDueDate: '2027-03-31' }, '2027-03-31')).toBe(
    '2027-04-30',
  )
  expect(nextDate({ ...month, nextDueDate: '2027-04-30' }, '2027-04-30')).toBe(
    '2027-05-31',
  )
  expect(
    nextDate(
      { ...month, startDate: '2028-01-31', nextDueDate: '2028-01-31' },
      '2028-01-31',
    ),
  ).toBe('2028-02-29')
  expect(nextDate({ ...month, nextDueDate: '2027-12-31' }, '2027-12-31')).toBe(
    '2028-01-31',
  )
  expect(nextDate({ ...month, nextDueDate: '2027-01-31' }, '2027-04-20')).toBe(
    '2027-04-30',
  )
})
it('入力・周期に合わない次回日・範囲外の日付を拒否する', () => {
  expect(validateRecurring({ ...input, title: '  掃除  ' }, ['a']).title).toBe(
    '掃除',
  )
  for (const patch of [
    { title: '' },
    { title: 'あ'.repeat(101) },
    { frequency: 'yearly' },
    { startDate: '2026-02-30' },
    { nextDueDate: '2026-10-20' },
    { nextDueDate: '2026-10-12' },
    { assigneeIds: ['x'] },
  ])
    expect(() =>
      validateRecurring({ ...input, ...patch } as typeof input, ['a']),
    ).toThrow()
  expect(() =>
    nextDate(
      {
        ...input,
        frequency: 'daily',
        startDate: '9999-12-31',
        nextDueDate: '9999-12-31',
      },
      '9999-12-31',
    ),
  ).toThrow()
  expect(historyId('definition', 2)).toBe('definition_2')
})
