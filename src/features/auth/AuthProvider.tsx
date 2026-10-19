import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { getFirebaseAuth } from '../../lib/firebase/client'
import { AuthContext } from './context'
import type { AuthState } from './context'
import { authMessage, errorCode } from './validation'
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
  })
  const [attempt, setAttempt] = useState(0)
  const publish = (user: User | null) =>
    setState({
      user,
      status: !user
        ? 'signedOut'
        : user.emailVerified
          ? 'signedIn'
          : 'unverified',
    })
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    void getFirebaseAuth()
      .then((auth) => {
        if (!active) return
        unsubscribe = onAuthStateChanged(
          auth,
          (user) => {
            if (active) publish(user)
          },
          () => {
            if (active) setState({ status: 'error', user: null })
          },
        )
      })
      .catch(() => {
        if (active) setState({ status: 'error', user: null })
      })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [attempt])
  const current = async () => {
    const auth = await getFirebaseAuth()
    if (!auth.currentUser) throw new Error('ログインが必要です。')
    return auth.currentUser
  }
  return (
    <AuthContext.Provider
      value={{
        ...state,
        retry: () => {
          setState({ status: 'loading', user: null })
          setAttempt((value) => value + 1)
        },
        register: async (email, password) => {
          const { user } = await createUserWithEmailAndPassword(
            await getFirebaseAuth(),
            email.trim(),
            password,
          )
          publish(user)
          try {
            await sendEmailVerification(user)
            return '確認メールを送りました。受信したメールのリンクを開いてください。'
          } catch (error) {
            return `アカウントは作成できましたが、確認メールを送れませんでした。再送してください。${authMessage(error)}`
          }
        },
        login: async (email, password) => {
          const { user } = await signInWithEmailAndPassword(
            await getFirebaseAuth(),
            email.trim(),
            password,
          )
          publish(user)
        },
        logout: async () => {
          await signOut(await getFirebaseAuth())
          publish(null)
        },
        resend: async () => {
          await sendEmailVerification(await current())
          return '確認メールを再送しました。'
        },
        verify: async () => {
          const user = await current()
          await reload(user)
          if (user.emailVerified) await getIdToken(user, true)
          publish(user)
          return user.emailVerified
            ? ''
            : 'まだメール確認が完了していません。メールのリンクを開いてからお試しください。'
        },
        reset: async (email) => {
          try {
            await sendPasswordResetEmail(await getFirebaseAuth(), email.trim())
          } catch (error) {
            if (errorCode(error) !== 'auth/user-not-found') throw error
          }
          return 'このメールアドレスが登録されている場合、再設定の案内が届きます。'
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
