// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeUpdates } from './observeUpdates'

describe('PWAの更新確認', () => {
  const cleanups: Array<() => void> = []
  const update = vi.fn<() => Promise<ServiceWorkerRegistration>>()
  const onWaiting = vi.fn()
  const onFailure = vi.fn()
  const onSuccess = vi.fn()
  let registration: ServiceWorkerRegistration

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    registration = {
      update,
      waiting: null,
    } as unknown as ServiceWorkerRegistration
    update.mockResolvedValue(registration)
  })

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup())
    vi.restoreAllMocks()
  })

  function start() {
    cleanups.push(
      observeUpdates(registration, { onWaiting, onFailure, onSuccess }),
    )
  }

  it('登録後に確認し、前面復帰時にも再確認する', async () => {
    start()
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
    expect(update).toHaveBeenCalledOnce()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2))
  })

  it('非表示・オフラインでは通信せず、オンライン復帰時に確認する', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    start()
    expect(update).not.toHaveBeenCalled()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    window.dispatchEvent(new Event('online'))
    expect(update).not.toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce())
  })

  it('延期した更新を前面復帰時に再通知する（オフラインでも適用可能）', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    Object.defineProperty(registration, 'waiting', {
      value: {},
      configurable: true,
    })
    start()
    expect(onWaiting).toHaveBeenCalledOnce()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onWaiting).toHaveBeenCalledTimes(2)
    expect(update).not.toHaveBeenCalled()
  })

  it('同時に複数イベントが来ても確認処理を重複させない', () => {
    update.mockReturnValue(new Promise(() => {}))
    start()
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledOnce()
  })

  it('失敗を通知し、次のイベントで再試行できる', async () => {
    update.mockRejectedValueOnce(new Error('network'))
    start()
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledOnce())
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
  })

  it('途中でオフラインになった失敗は警告しない', async () => {
    update.mockImplementation(async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      throw new Error('offline')
    })
    start()
    await Promise.resolve()
    await Promise.resolve()
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('解除後のイベント・保留中の結果でコールバックしない', async () => {
    let reject: (error: Error) => void = () => {}
    update.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const stop = observeUpdates(registration, {
      onWaiting,
      onFailure,
      onSuccess,
    })
    stop()
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(update).toHaveBeenCalledOnce()
    reject(new Error('late error'))
    await Promise.resolve()
    await Promise.resolve()
    expect(onFailure).not.toHaveBeenCalled()
  })
})
