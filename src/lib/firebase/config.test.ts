import { describe, expect, it } from 'vitest'
import { readFirebaseConfig } from './config'

const validEnv = {
  VITE_FIREBASE_API_KEY: 'example-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'example-project',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
}

describe('readFirebaseConfig', () => {
  it('設定がなくても起動可能な未設定状態を返す', () => {
    expect(readFirebaseConfig({})).toEqual({ status: 'unconfigured' })
  })

  it('空文字・空白だけの値は未設定として扱う', () => {
    expect(
      readFirebaseConfig({
        VITE_FIREBASE_API_KEY: '  ',
        VITE_FIREBASE_APP_ID: '',
      }),
    ).toEqual({ status: 'unconfigured' })
  })

  it('一部だけ設定されている場合は不足項目を返す', () => {
    expect(readFirebaseConfig({ VITE_FIREBASE_API_KEY: 'key' })).toEqual({
      status: 'invalid',
      missingKeys: [
        'VITE_FIREBASE_AUTH_DOMAIN',
        'VITE_FIREBASE_PROJECT_ID',
        'VITE_FIREBASE_APP_ID',
      ],
    })
  })

  it('必要な設定をFirebase SDK用の形式に変換する', () => {
    expect(readFirebaseConfig(validEnv)).toEqual({
      status: 'configured',
      options: {
        apiKey: 'example-api-key',
        authDomain: 'example.firebaseapp.com',
        projectId: 'example-project',
        appId: '1:123:web:abc',
      },
      useEmulators: false,
    })
  })

  it('値の前後の空白を取り除く', () => {
    const result = readFirebaseConfig({
      ...validEnv,
      VITE_FIREBASE_PROJECT_ID: '  example-project  ',
    })
    expect(result.status).toBe('configured')
    if (result.status === 'configured') {
      expect(result.options.projectId).toBe('example-project')
    }
  })

  it('明示的なtrueのときだけエミュレーターを有効にする', () => {
    const result = readFirebaseConfig({
      ...validEnv,
      VITE_USE_FIREBASE_EMULATORS: 'true',
    })
    expect(result).toMatchObject({ status: 'configured', useEmulators: true })
    expect(
      readFirebaseConfig({ ...validEnv, VITE_USE_FIREBASE_EMULATORS: 'false' }),
    ).toMatchObject({ status: 'configured', useEmulators: false })
  })

  it('エミュレーター設定の誤記で本番に接続しない', () => {
    expect(
      readFirebaseConfig({ ...validEnv, VITE_USE_FIREBASE_EMULATORS: 'TRUE' }),
    ).toEqual({
      status: 'invalid',
      invalidKeys: ['VITE_USE_FIREBASE_EMULATORS'],
    })
  })
})
