// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { PwaUpdateNotice } from './PwaUpdateNotice'

const mock = vi.hoisted(() => ({
  needRefresh: false,
  options: {} as RegisterSWOptions,
  updateServiceWorker: vi.fn(),
}))

vi.mock('virtual:pwa-register/react', async () => {
  const { useState } = await import('react')
  return {
    useRegisterSW: (options: RegisterSWOptions) => {
      mock.options = options
      return {
        needRefresh: useState(mock.needRefresh),
        offlineReady: useState(false),
        updateServiceWorker: mock.updateServiceWorker,
      }
    },
  }
})

beforeEach(() => {
  mock.needRefresh = false
  mock.options = {}
  mock.updateServiceWorker.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('PWA更新通知', () => {
  it('更新がなければ表示しない', () => {
    const { container } = render(<PwaUpdateNotice />)
    expect(container.textContent).toBe('')
  })

  it('あとでを選ぶと適用せず通知を閉じる', () => {
    mock.needRefresh = true
    render(<PwaUpdateNotice />)
    fireEvent.click(screen.getByRole('button', { name: 'あとで' }))
    expect(screen.queryByRole('button', { name: '更新する' })).toBeNull()
    expect(mock.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('更新操作の多重送信を防ぐ', async () => {
    mock.needRefresh = true
    mock.updateServiceWorker.mockReturnValue(new Promise(() => {}))
    render(<PwaUpdateNotice />)
    fireEvent.click(screen.getByRole('button', { name: '更新する' }))
    const applying = screen.getByRole('button', {
      name: '更新しています…',
    }) as HTMLButtonElement
    expect(applying.disabled).toBe(true)
    fireEvent.click(applying)
    expect(mock.updateServiceWorker).toHaveBeenCalledExactlyOnceWith(true)
    await act(async () => {})
  })

  it('適用失敗を表示し、再試行できる', async () => {
    mock.needRefresh = true
    mock.updateServiceWorker.mockRejectedValueOnce(new Error('failed'))
    render(<PwaUpdateNotice />)
    fireEvent.click(screen.getByRole('button', { name: '更新する' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        '更新できませんでした',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '更新する' }))
    expect(mock.updateServiceWorker).toHaveBeenCalledTimes(2)
  })

  it('登録失敗時は説明を表示し、閉じられる', () => {
    render(<PwaUpdateNotice />)
    act(() => mock.options.onRegisterError?.(new Error('failed')))
    expect(screen.getByRole('status').textContent).toContain('再読み込み')
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
