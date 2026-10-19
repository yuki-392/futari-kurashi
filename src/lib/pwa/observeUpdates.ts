type UpdateCallbacks = {
  onWaiting: () => void
  onFailure: () => void
  onSuccess: () => void
}

/** SW登録後・前面復帰・オンライン復帰の確認をまとめて管理する。 */
export function observeUpdates(
  registration: ServiceWorkerRegistration,
  callbacks: UpdateCallbacks,
): () => void {
  let disposed = false
  let checking = false

  const check = async () => {
    if (disposed || document.visibilityState !== 'visible') return
    // waitingのアセットはインストール済みなので、オフラインでも適用できる。
    if (registration.waiting) callbacks.onWaiting()
    if (!navigator.onLine || checking) return
    checking = true
    try {
      await registration.update()
      if (!disposed) callbacks.onSuccess()
    } catch {
      if (!disposed && navigator.onLine) callbacks.onFailure()
    } finally {
      checking = false
    }
  }

  const onWake = () => {
    void check()
  }
  document.addEventListener('visibilitychange', onWake)
  window.addEventListener('online', onWake)
  onWake()

  return () => {
    disposed = true
    document.removeEventListener('visibilitychange', onWake)
    window.removeEventListener('online', onWake)
  }
}
