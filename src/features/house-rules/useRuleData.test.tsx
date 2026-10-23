// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRuleData } from './useRuleData'
import type { RuleCategory } from './model'
const m = vi.hoisted(() => ({
  uid: 'a',
  hid: 'h',
  watch: vi.fn(),
  ensure: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('../household/context', () => ({
  useHousehold: () => ({ uid: m.uid, household: { id: m.hid } }),
}))
vi.mock('./service', () => ({
  ensureRuleCategories: m.ensure,
  watchRuleCollection: m.watch,
}))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  m.uid = 'a'
  m.hid = 'h'
  m.ensure.mockResolvedValue(undefined)
  m.watch.mockReturnValue(m.stop)
})
it('retains loaded categories on failure, retry and extra-page loading but clears them for a different identity', async () => {
  const callbacks: {
    next: (items: unknown[], more: boolean) => void
    fail: () => void
  }[] = []
  m.watch.mockImplementation(
    (
      _h: unknown,
      _q: unknown,
      next: (items: unknown[], more: boolean) => void,
      fail: () => void,
    ) => {
      callbacks.push({ next, fail })
      return m.stop
    },
  )
  const { result, rerender } = renderHook(
    ({ count }) => useRuleData<RuleCategory>({ kind: 'categories', count }),
    { initialProps: { count: 100 } },
  )
  await waitFor(() => expect(callbacks).toHaveLength(1))
  act(() =>
    callbacks[0]!.next([{ id: 'chores', name: '家事', archived: false }], true),
  )
  act(() => callbacks[0]!.fail())
  expect(result.current.status).toBe('error')
  expect(result.current.items[0]!.id).toBe('chores')
  act(() => result.current.retry())
  expect(result.current.items[0]!.id).toBe('chores')
  await waitFor(() => expect(callbacks).toHaveLength(2))
  act(() =>
    callbacks[1]!.next([{ id: 'chores', name: '家事', archived: false }], true),
  )
  rerender({ count: 200 })
  expect(result.current.items[0]!.id).toBe('chores')
  m.uid = 'b'
  rerender({ count: 200 })
  expect(result.current.items).toHaveLength(0)
  expect(m.stop).toHaveBeenCalled()
})
