import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { HouseholdContext } from './context'
import type { HouseholdState } from './context'
import {
  watchHousehold,
  createHousehold,
  issueInvitation,
  cancelInvitation,
  inspectInvitation,
  joinHousehold,
} from './service'
// 呼び出し側が認証UIDをkeyに指定し、別ユーザーの状態を再利用しない。
export function HouseholdProvider({
  uid,
  email,
  children,
}: {
  uid: string
  email: string
  children: ReactNode
}) {
  const [state, setState] = useState<HouseholdState>({
    status: 'loading',
    household: null,
  })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const stop = watchHousehold(
      uid,
      (household) => {
        if (active)
          setState({ status: household ? 'joined' : 'none', household })
      },
      () => {
        if (active) setState({ status: 'error', household: null })
      },
    )
    return () => {
      active = false
      stop()
    }
  }, [uid, attempt])
  const householdId = () => {
    if (!state.household) throw new Error('世帯がありません。')
    return state.household.id
  }
  return (
    <HouseholdContext.Provider
      value={{
        ...state,
        uid,
        email,
        create: (name) => createHousehold(uid, name),
        issue: (email) => issueInvitation(uid, householdId(), email),
        cancel: () => cancelInvitation(uid, householdId()),
        inspect: inspectInvitation,
        join: (code) => joinHousehold(uid, code),
        retry: () => {
          setState({ status: 'loading', household: null })
          setAttempt((n) => n + 1)
        },
      }}
    >
      {children}
    </HouseholdContext.Provider>
  )
}
