import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({
  app: { name: 'futari-kurashi' },
  auth: { languageCode: '' },
  db: {},
  getAuth: vi.fn(),
  getFirestore: vi.fn(),
  connectAuth: vi.fn(),
  connectFirestore: vi.fn(),
}))
vi.mock('./config', () => ({
  firebaseConfig: { status: 'configured', useEmulators: true, options: {} },
}))
vi.mock('firebase/app', () => ({
  getApps: () => [mock.app],
  initializeApp: vi.fn(),
}))
vi.mock('firebase/auth', () => ({
  getAuth: mock.getAuth,
  connectAuthEmulator: mock.connectAuth,
}))
vi.mock('firebase/firestore', () => ({
  getFirestore: mock.getFirestore,
  connectFirestoreEmulator: mock.connectFirestore,
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.getAuth.mockReturnValue(mock.auth)
  mock.getFirestore.mockReturnValue(mock.db)
})
it('Auth単独の同時呼び出しでFirestoreを初期化せず、Authを共有する', async () => {
  const { getFirebaseAuth } = await import('./client')
  const [a, b] = await Promise.all([getFirebaseAuth(), getFirebaseAuth()])
  expect(a).toBe(b)
  expect(mock.getAuth).toHaveBeenCalledOnce()
  expect(mock.connectAuth).toHaveBeenCalledOnce()
  expect(mock.getFirestore).not.toHaveBeenCalled()
})
it('既存サービスAPIでもAuthとFirestore初期化を共有する', async () => {
  const { getFirebaseAuth, getFirebaseServices } = await import('./client')
  const auth = await getFirebaseAuth()
  const [a, b] = await Promise.all([
    getFirebaseServices(),
    getFirebaseServices(),
  ])
  expect(a).toBe(b)
  expect(a.auth).toBe(auth)
  expect(a.db).toBe(mock.db)
  expect(mock.getAuth).toHaveBeenCalledOnce()
  expect(mock.connectFirestore).toHaveBeenCalledOnce()
})
it('初期化が失敗しても次の呼び出しで回復できる', async () => {
  mock.getAuth.mockImplementationOnce(() => {
    throw new Error('failed')
  })
  const { getFirebaseAuth } = await import('./client')
  await expect(getFirebaseAuth()).rejects.toThrow('failed')
  await expect(getFirebaseAuth()).resolves.toBe(mock.auth)
})
