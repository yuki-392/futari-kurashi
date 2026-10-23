import { tokyoDate } from '../tasks/model'
import { describe, expect, it } from 'vitest'
import {
  cleanRuleInput,
  ruleChange,
  reviewDue,
  standardRuleCategories,
} from './model'
import type { HouseRule } from './model'
const input = {
  title: '  共有ルール  ',
  body: ' 内容\nを共有 ',
  categoryId: 'chores',
  reviewDate: '2026-10-23',
}
const rule = {
  id: 'r',
  ...input,
  title: '共有ルール',
  body: '内容',
  categoryName: '家事',
  version: 5,
  contentVersion: 2,
  agreedUids: ['a', 'b'],
  archived: false,
  lastAction: 'agree',
  createdAt: null,
  createdBy: 'a',
  updatedAt: null,
  updatedBy: 'b',
} as HouseRule
describe('house rules', () => {
  it('trims text, preserves line breaks, validates real days and boundaries', () => {
    expect(cleanRuleInput(input)).toMatchObject({
      title: '共有ルール',
      body: '内容\nを共有',
    })
    expect(
      cleanRuleInput({
        ...input,
        title: 'あ'.repeat(100),
        body: 'い'.repeat(2000),
        reviewDate: '2028-02-29',
      }),
    ).toBeTruthy()
    for (const change of [
      { title: ' ' },
      { title: 'あ'.repeat(101) },
      { body: '' },
      { body: 'い'.repeat(2001) },
      { reviewDate: '2026-02-29' },
      { reviewDate: '2026-13-01' },
      { reviewDate: '0999-12-31' },
    ])
      expect(() => cleanRuleInput({ ...input, ...change })).toThrow()
    expect(cleanRuleInput({ ...input, reviewDate: null }).reviewDate).toBeNull()
  })
  it('all setting changes clear agreement, including category and review date; reopening does too', () => {
    for (const data of [
      input,
      { ...input, categoryId: 'other' },
      { ...input, reviewDate: null },
    ])
      expect(ruleChange(rule, 'edit', 'a', ['a', 'b'], data)).toMatchObject({
        version: 6,
        contentVersion: 3,
        agreedUids: [],
        archived: false,
      })
    expect(
      ruleChange(
        { ...rule, archived: true },
        'restore',
        'a',
        ['a', 'b'],
        input,
      ),
    ).toMatchObject({ archived: false, contentVersion: 3, agreedUids: [] })
  })
  it('preserves counterpart agreement and only removes own; repeated action has no history', () => {
    const first = { ...rule, agreedUids: [] }
    const after = ruleChange(first, 'agree', 'a', ['a', 'b'])
    expect(after!.agreedUids).toEqual(['a'])
    expect(
      ruleChange({ ...rule, ...after }, 'agree', 'b', ['a', 'b']),
    ).toMatchObject({ agreedUids: ['a', 'b'], contentVersion: 2, version: 7 })
    expect(ruleChange(rule, 'withdraw', 'a', ['a', 'b'])).toMatchObject({
      agreedUids: ['b'],
      contentVersion: 2,
    })
    expect(ruleChange(rule, 'agree', 'a', ['a', 'b'])).toBeNull()
    expect(() => ruleChange(rule, 'withdraw', 'outsider', ['a', 'b'])).toThrow()
  })
  it('retired rule is read-only until restored; retirement preserves content and old agreement', () => {
    expect(ruleChange(rule, 'retire', 'b', ['a', 'b'])).toMatchObject({
      archived: true,
      contentVersion: 2,
      agreedUids: ['a', 'b'],
    })
    for (const action of ['edit', 'agree', 'withdraw', 'retire'] as const)
      expect(() =>
        ruleChange({ ...rule, archived: true }, action, 'a', ['a', 'b'], input),
      ).toThrow()
  })
  it('uses Tokyo calendar days for review and initializes five immutable category identities', () => {
    expect(reviewDue(null, '2026-10-23')).toBe(false)
    expect(reviewDue('2026-10-23', '2026-10-23')).toBe(true)
    expect(reviewDue('2026-10-24', '2026-10-23')).toBe(false)
    expect(standardRuleCategories.map((c) => c.name)).toEqual([
      '家事',
      'お金',
      '生活習慣',
      '共有スペース',
      'その他',
    ])
  })
})

it('switches due-review badges exactly at Tokyo midnight', () => {
  expect(
    reviewDue('2026-10-23', tokyoDate(new Date('2026-10-22T14:59:59Z'))),
  ).toBe(false)
  expect(
    reviewDue('2026-10-23', tokyoDate(new Date('2026-10-22T15:00:00Z'))),
  ).toBe(true)
})
