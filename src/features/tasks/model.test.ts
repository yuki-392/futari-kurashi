import { expect, it } from 'vitest'
import { cleanInput, assigneeLabel, tokyoDate, isOverdue } from './model'
const input = {
  title: '  ごみを出す  ',
  assigneeIds: ['a'],
  dueDate: null,
  priority: 'medium' as const,
}
it('タイトルの空白・Unicode長、担当、期限、優先度を検証する', () => {
  expect(cleanInput(input, ['a', 'b']).title).toBe('ごみを出す')
  for (const title of ['', '  ', 'あ'.repeat(101)])
    expect(() => cleanInput({ ...input, title }, ['a'])).toThrow()
  expect(
    cleanInput({ ...input, title: '🏠'.repeat(100) }, ['a']).title,
  ).toHaveLength(200)
  for (const assigneeIds of [['x'], ['a', 'a'], ['a', 'b', 'c']])
    expect(() => cleanInput({ ...input, assigneeIds }, ['a', 'b'])).toThrow()
  for (const assigneeIds of [[], ['a'], ['b'], ['a', 'b']])
    expect(
      cleanInput({ ...input, assigneeIds }, ['a', 'b']).assigneeIds,
    ).toEqual(assigneeIds)
  for (const dueDate of [
    '2025-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-1-01',
    'bad',
  ])
    expect(() => cleanInput({ ...input, dueDate }, ['a'])).toThrow()
  expect(cleanInput({ ...input, dueDate: '2028-02-29' }, ['a']).dueDate).toBe(
    '2028-02-29',
  )
  expect(() =>
    cleanInput({ ...input, priority: 'invalid' as 'medium' }, ['a']),
  ).toThrow()
})
it('担当を閲覧者基準で表示する', () => {
  expect(assigneeLabel([], 'a')).toBe('未担当')
  expect(assigneeLabel(['a'], 'a')).toBe('自分')
  expect(assigneeLabel(['a'], 'b')).toBe('相手')
  expect(assigneeLabel(['a', 'b'], 'b')).toBe('2人')
})
it('日本時間の境界と期限切れを判定する', () => {
  expect(tokyoDate(new Date('2026-10-20T14:59:59Z'))).toBe('2026-10-20')
  expect(tokyoDate(new Date('2026-10-20T15:00:00Z'))).toBe('2026-10-21')
  expect(isOverdue('2026-10-19', false, '2026-10-20')).toBe(true)
  expect(isOverdue('2026-10-20', false, '2026-10-20')).toBe(false)
  expect(isOverdue(null, false, '2026-10-20')).toBe(false)
  expect(isOverdue('2026-10-19', true, '2026-10-20')).toBe(false)
})
