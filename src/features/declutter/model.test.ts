import { expect, it } from 'vitest'
import {
  cleanDeclutterInput,
  ownerLabel,
  completionChange,
  completionLabel,
} from './model'
const input = {
  title: ' 古い服 ',
  method: 'hold',
  ownerIds: ['a'],
  dueDate: null,
} as const
it('品名を整え、期限なし・所有者未設定と相対表示を扱う', () => {
  expect(cleanDeclutterInput({ ...input, ownerIds: [] }, ['a'])).toEqual({
    title: '古い服',
    method: 'hold',
    ownerIds: [],
    dueDate: null,
  })
  expect(ownerLabel([], 'a')).toBe('未設定')
  expect(ownerLabel(['a'], 'a')).toBe('自分')
  expect(ownerLabel(['b'], 'a')).toBe('相手')
  expect(ownerLabel(['a', 'b'], 'a')).toBe('2人')
})
it('100文字・実在日・閏年・年範囲と所有者を検証する', () => {
  for (const dueDate of [null, '2024-02-29', '1000-01-01', '9999-12-31'])
    expect(() =>
      cleanDeclutterInput(
        { ...input, title: '😀'.repeat(100), ownerIds: ['a', 'b'], dueDate },
        ['a', 'b'],
      ),
    ).not.toThrow()
  for (const patch of [
    { title: '' },
    { title: ' \n ' },
    { title: 'x'.repeat(101) },
    { method: 'unknown' },
    { ownerIds: ['x'] },
    { ownerIds: ['a', 'a'] },
    { ownerIds: ['a', 'b', 'c'] },
    { dueDate: '2025-02-29' },
    { dueDate: '2026-04-31' },
    { dueDate: '2026-1-1' },
    { dueDate: '' },
    { dueDate: '0999-12-31' },
  ])
    expect(() =>
      cleanDeclutterInput({ ...input, ...patch } as never, ['a', 'b']),
    ).toThrow()
})
it('保留は完了できず、完了の通常編集で監査を保持し、解除でのみ消す', () => {
  const current = { completed: false, completedAt: null, completedBy: null }
  expect(() => completionChange(current, true, 'hold', 'b', 'server')).toThrow(
    '処分方法',
  )
  const completed = completionChange(current, true, 'sell', 'b', 'server')
  expect(completed).toEqual({
    completed: true,
    completedAt: 'server',
    completedBy: 'b',
  })
  expect(completionChange(completed, true, 'give', 'a', 'later')).toEqual(
    completed,
  )
  expect(() => completionChange(completed, true, 'hold', 'a', 'later')).toThrow(
    '未処分',
  )
  expect(completionChange(completed, false, 'hold', 'a', 'later')).toEqual(
    current,
  )
  expect(
    completionChange(current, true, 'discard', 'a', 'later'),
  ).toMatchObject({ completedAt: 'later', completedBy: 'a' })
})
it('完了日時は日本時間、記録者は所有者から推測しない', () => {
  expect(
    completionLabel({ toDate: () => new Date('2026-10-19T15:05:00Z') }),
  ).toContain('2026/10/20')
  expect(completionLabel(null)).toBe('確認中')
})
