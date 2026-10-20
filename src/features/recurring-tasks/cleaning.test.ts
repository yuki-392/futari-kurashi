import { expect, it } from 'vitest'
import { validateRecurring } from './model'
import {
  cleaningFields,
  rotatedAssignees,
  weekBounds,
  cleaningOccurrences,
} from '../cleaning/model'
const input = {
  title: '掃除',
  assigneeIds: ['a'],
  priority: 'medium' as const,
  frequency: 'daily' as const,
  startDate: '2026-10-19',
  nextDueDate: '2026-10-19',
}
it('旧形式は固定/一般、新形式は場所を整え交代は2人かつ担当1人だけ', () => {
  expect(cleaningFields({})).toEqual({
    taskType: 'general',
    place: '',
    rotation: 'fixed',
  })
  expect(
    validateRecurring(
      { ...input, place: ' キッチン ', rotation: 'alternate' },
      ['a', 'b'],
    ),
  ).toMatchObject({
    taskType: 'cleaning',
    place: 'キッチン',
    rotation: 'alternate',
  })
  for (const value of [
    { place: 'x'.repeat(41) },
    { place: 'x', rotation: 'alternate', assigneeIds: [] },
    { place: 'x', rotation: 'alternate', assigneeIds: ['a', 'b'] },
    { place: 'x', rotation: 'bad' },
  ])
    expect(() =>
      validateRecurring({ ...input, ...value } as never, ['a', 'b']),
    ).toThrow()
  expect(() =>
    validateRecurring({ ...input, rotation: 'alternate' }, ['a']),
  ).toThrow()
  expect(
    validateRecurring({ ...input, place: 'x'.repeat(40) }, ['a']),
  ).toMatchObject({ taskType: 'cleaning' })
})
it('交代は現在担当から選び、固定はそのまま', () => {
  expect(
    rotatedAssignees({ ...input, rotation: 'alternate' }, ['a', 'b']),
  ).toEqual(['b'])
  expect(rotatedAssignees(input, ['a', 'b'])).toEqual(['a'])
})
it('月〜日、年越し、持ち越しを今日完了した想定の未来予定だけを参考表示', () => {
  expect(weekBounds('2027-01-03')).toEqual({
    start: '2026-12-28',
    end: '2027-01-03',
  })
  const entries = cleaningOccurrences(
    { ...input, id: 'x', active: true, rotation: 'alternate' } as never,
    '2026-10-21',
    '2026-10-25',
    ['a', 'b'],
  )
  expect(entries.map((x) => [x.date, x.reference, x.assigneeIds])).toEqual([
    ['2026-10-19', false, ['a']],
    ['2026-10-22', true, ['b']],
    ['2026-10-23', true, ['a']],
    ['2026-10-24', true, ['b']],
    ['2026-10-25', true, ['a']],
  ])
  expect(
    cleaningOccurrences(
      { ...input, active: false } as never,
      '2026-10-21',
      '2026-10-25',
      ['a', 'b'],
    ),
  ).toEqual([])
})
it('月末と週次を周期に沿って投影、過去の欠落予定を生成しない', () => {
  const m = {
    ...input,
    id: 'm',
    active: true,
    frequency: 'monthly',
    startDate: '2028-01-31',
    nextDueDate: '2028-02-29',
  } as never
  expect(
    cleaningOccurrences(m, '2028-02-28', '2028-03-05', ['a', 'b']).map(
      (x) => x.date,
    ),
  ).toEqual(['2028-02-29'])
  const w = { ...input, id: 'w', active: true, frequency: 'weekly' } as never
  expect(
    cleaningOccurrences(w, '2026-11-04', '2026-11-08', ['a', 'b']).map(
      (x) => x.date,
    ),
  ).toEqual(['2026-10-19'])
})
