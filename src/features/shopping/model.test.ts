import { expect, it } from 'vitest'
import { cleanShoppingInput, normalizeQuantity, parseBudget } from './model'
const input = {
  title: ' 牛乳 ',
  category: 'food',
  quantity: '1',
  unit: ' 個 ',
  budget: null,
  assigneeIds: ['a'],
  priority: 2,
} as const
it('初期相当の値を整え、数量は10進文字列で正規化し予算の未設定と0を区別', () => {
  expect(
    cleanShoppingInput({ ...input, assigneeIds: ['a'] }, ['a', 'b']),
  ).toMatchObject({ title: '牛乳', unit: '個', quantity: '1', budget: null })
  for (const [v, w] of [
    ['0001.200', '1.2'],
    ['999999.999', '999999.999'],
    ['0.001', '0.001'],
    ['1.000', '1'],
  ])
    expect(normalizeQuantity(v!)).toBe(w)
  expect(parseBudget('')).toBe(null)
  expect(parseBudget(' 0 ')).toBe(0)
  expect(parseBudget('999999999')).toBe(999999999)
})
it('商品名/単位/カテゴリ/担当/優先度/予算の境界を検証する', () => {
  const valid = { ...input, assigneeIds: ['a'] }
  expect(() =>
    cleanShoppingInput(
      { ...valid, title: 'x'.repeat(100), unit: 'x'.repeat(10), budget: 0 },
      ['a'],
    ),
  ).not.toThrow()
  for (const patch of [
    { title: '' },
    { title: 'x'.repeat(101) },
    { unit: 'x'.repeat(11) },
    { category: 'invalid' },
    { priority: 0 },
    { priority: 4 },
    { priority: 1.5 },
    { assigneeIds: ['x'] },
    { assigneeIds: ['a', 'a'] },
    { budget: -1 },
    { budget: 0.1 },
    { budget: 1e9 },
    { budget: NaN },
  ])
    expect(() =>
      cleanShoppingInput({ ...valid, ...patch } as never, ['a', 'b']),
    ).toThrow()
  for (const v of [
    '',
    '0',
    '0.000',
    '-1',
    '1e2',
    '1,2',
    '1.0001',
    '1000000',
    'NaN',
    'Infinity',
    '.5',
    '1.',
  ])
    expect(() => normalizeQuantity(v)).toThrow()
  for (const v of ['-1', '1.5', '1e2', '1000000000', 'NaN'])
    expect(() => parseBudget(v)).toThrow()
})
