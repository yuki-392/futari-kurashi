import { expect, it } from 'vitest'
import {
  normalizeCode,
  validateName,
  normalizeEmail,
  newCode,
  householdMessage,
} from './model'
it('世帯名の空白と1〜40文字の境界を検証する', () => {
  expect(validateName('  ')).toBeTruthy()
  expect(validateName('家'.repeat(40))).toBeNull()
  expect(validateName('家'.repeat(41))).toBeTruthy()
})
it('コードとメールを正規化し、128bitのコードを生成する', () => {
  expect(normalizeCode(' ABCD-1234 abcd-1234 ABCD-1234 abcd-1234 ')).toBe(
    'abcd1234abcd1234abcd1234abcd1234',
  )
  expect(normalizeEmail(' Partner@Example.test ')).toBe('partner@example.test')
  expect(newCode()).toMatch(/^[a-f0-9]{32}$/)
  expect(newCode()).not.toBe(newCode())
})
it('権限拒否では招待の詳細や存在を漏らさない', () => {
  expect(householdMessage({ code: 'permission-denied' })).toContain(
    '招待コードを確認',
  )
  expect(householdMessage({ code: 'unavailable' })).toContain('通信')
})
