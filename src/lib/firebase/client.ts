import { firebaseConfig } from './config'
import { getApps, initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
async function initializeAuthClient() {
  if (firebaseConfig.status !== 'configured')
    throw new Error('Firebaseの設定を確認してください。')
  const app =
    getApps().find((entry) => entry.name === 'futari-kurashi') ??
    initializeApp(firebaseConfig.options, 'futari-kurashi')
  const auth = getAuth(app)
  auth.languageCode = 'ja'
  if (firebaseConfig.useEmulators)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099')
  return { app, auth }
}
let authClient: ReturnType<typeof initializeAuthClient> | undefined
function getAuthClient() {
  authClient ??= initializeAuthClient().catch((error: unknown) => {
    authClient = undefined
    throw error
  })
  return authClient
}
export async function getFirebaseAuth() {
  return (await getAuthClient()).auth
}
async function initializeServices() {
  const [{ app, auth }, sdk] = await Promise.all([
    getAuthClient(),
    import('firebase/firestore'),
  ])
  // SDKの警告に文書パス（招待コード）が含まれるため、エラーはUIで扱う。
  sdk.setLogLevel('silent')
  const db = sdk.getFirestore(app)
  if (firebaseConfig.status === 'configured' && firebaseConfig.useEmulators)
    sdk.connectFirestoreEmulator(db, '127.0.0.1', 8080)
  return { app, auth, db }
}
let services: ReturnType<typeof initializeServices> | undefined
export function getFirebaseServices() {
  services ??= initializeServices().catch((error: unknown) => {
    services = undefined
    throw error
  })
  return services
}
