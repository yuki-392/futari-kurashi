import type { FirebaseOptions } from 'firebase/app'

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

type FirebaseConfig =
  | { status: 'unconfigured' }
  | { status: 'invalid'; missingKeys: string[] }
  | { status: 'invalid'; invalidKeys: string[] }
  | {
      status: 'configured'
      options: FirebaseOptions
      useEmulators: boolean
    }

function value(env: Readonly<Record<string, unknown>>, key: string): string {
  const entry = env[key]
  return typeof entry === 'string' ? entry.trim() : ''
}

export function readFirebaseConfig(
  env: Readonly<Record<string, unknown>>,
): FirebaseConfig {
  const emulatorFlag = value(env, 'VITE_USE_FIREBASE_EMULATORS')
  if (!['', 'false', 'true'].includes(emulatorFlag)) {
    return { status: 'invalid', invalidKeys: ['VITE_USE_FIREBASE_EMULATORS'] }
  }

  const missingKeys = requiredKeys.filter((key) => !value(env, key))
  if (missingKeys.length === requiredKeys.length) {
    return { status: 'unconfigured' }
  }
  if (missingKeys.length > 0) {
    return { status: 'invalid', missingKeys }
  }

  return {
    status: 'configured',
    options: {
      apiKey: value(env, 'VITE_FIREBASE_API_KEY'),
      authDomain: value(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: value(env, 'VITE_FIREBASE_PROJECT_ID'),
      appId: value(env, 'VITE_FIREBASE_APP_ID'),
    },
    useEmulators: emulatorFlag === 'true',
  }
}

export const firebaseConfig = readFirebaseConfig(import.meta.env)
