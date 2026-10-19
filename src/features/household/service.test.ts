import { expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  listen: vi.fn(),
  stopUser: vi.fn(),
  stopHome: vi.fn(),
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: {} }),
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  collection: vi.fn(),
  arrayUnion: vi.fn(),
  getDocFromServer: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  onSnapshot: mock.listen,
}))
import { watchHousehold } from './service'
it('未確定の所属・世帯を表示せず、確定通知を受けて購読を解除する', async () => {
  const next = vi.fn(),
    error = vi.fn()
  const callbacks: Record<string, (value: unknown) => void> = {}
  mock.listen.mockImplementation(
    (path: string, options: unknown, callback: (value: unknown) => void) => {
      expect(options).toEqual({ includeMetadataChanges: true })
      callbacks[path] = callback
      return path.startsWith('users') ? mock.stopUser : mock.stopHome
    },
  )
  const stop = watchHousehold('owner', next, error)
  await vi.waitFor(() => expect(mock.listen).toHaveBeenCalledOnce())
  const user = {
    exists: () => true,
    data: () => ({ householdId: 'home' }),
    metadata: { hasPendingWrites: true },
  }
  callbacks['users/owner']!(user)
  expect(mock.listen).toHaveBeenCalledOnce()
  callbacks['users/owner']!({ ...user, metadata: { hasPendingWrites: false } })
  expect(mock.listen).toHaveBeenCalledTimes(2)
  const home = {
    exists: () => true,
    data: () => ({ name: '家', memberIds: ['owner'] }),
    metadata: { hasPendingWrites: true },
  }
  callbacks['households/home']!(home)
  expect(next).not.toHaveBeenCalled()
  callbacks['households/home']!({
    ...home,
    metadata: { hasPendingWrites: false },
  })
  expect(next).toHaveBeenCalledWith({
    id: 'home',
    name: '家',
    memberIds: ['owner'],
  })
  stop()
  expect(mock.stopUser).toHaveBeenCalledOnce()
  expect(mock.stopHome).toHaveBeenCalledOnce()
  callbacks['households/home']!({
    ...home,
    metadata: { hasPendingWrites: false },
  })
  expect(next).toHaveBeenCalledOnce()
})
