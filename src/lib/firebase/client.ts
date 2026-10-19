import { firebaseConfig } from './config'

async function initializeServices() {
  if (firebaseConfig.status !== 'configured') {
    throw new Error(
      'Firebaseの設定が不足しています。.env.localを確認してください。',
    )
  }

  const [
    { initializeApp, getApps },
    { getAuth, connectAuthEmulator },
    firestore,
  ] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])

  const app =
    getApps().find((entry) => entry.name === 'futari-kurashi') ??
    initializeApp(firebaseConfig.options, 'futari-kurashi')
  const auth = getAuth(app)
  // デフォルトはメモリーキャッシュ。端末への永続保存は有効にしない。
  const db = firestore.getFirestore(app)

  if (firebaseConfig.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099')
    firestore.connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }

  return { app, auth, db }
}

let services: ReturnType<typeof initializeServices> | undefined

/** 最初の利用時だけSDKをロードし、同時呼び出しでも初期化を共有する。 */
export function getFirebaseServices() {
  services ??= initializeServices().catch((error: unknown) => {
    services = undefined
    throw error
  })
  return services
}
