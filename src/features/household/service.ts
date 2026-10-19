import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import type { Household, Invitation } from './model'
import { newCode, normalizeCode, normalizeEmail, validateName } from './model'
const invalid = () =>
  Object.assign(new Error('invalid invitation'), { code: 'invalid-invitation' })
export async function createHousehold(uid: string, name: string) {
  const cleanName = name.trim()
  if (validateName(cleanName)) throw new Error('invalid name')
  const { db } = await getFirebaseServices()
  const home = doc(collection(db, 'households')),
    user = doc(db, 'users', uid)
  await runTransaction(db, async (tx) => {
    if ((await tx.get(user)).exists())
      throw Object.assign(new Error('already member'), {
        code: 'already-member',
      })
    tx.set(home, {
      name: cleanName,
      ownerId: uid,
      memberIds: [uid],
      activeInviteId: null,
      createdAt: serverTimestamp(),
    })
    tx.set(user, { householdId: home.id, createdAt: serverTimestamp() })
  })
}
export async function issueInvitation(
  uid: string,
  householdId: string,
  email: string,
) {
  const { db } = await getFirebaseServices()
  const code = newCode(),
    home = doc(db, 'households', householdId)
  await runTransaction(db, async (tx) => {
    const data = (await tx.get(home)).data()
    if (!data || data.ownerId !== uid || data.memberIds.length !== 1)
      throw invalid()
    tx.set(doc(db, 'householdInvites', code), {
      householdId,
      householdName: data.name,
      createdBy: uid,
      targetEmail: normalizeEmail(email),
      createdAt: serverTimestamp(),
      usedBy: null,
      usedAt: null,
    })
    tx.update(home, { activeInviteId: code })
  })
}
export async function cancelInvitation(uid: string, householdId: string) {
  const { db } = await getFirebaseServices()
  const home = doc(db, 'households', householdId)
  await runTransaction(db, async (tx) => {
    const data = (await tx.get(home)).data()
    if (!data || data.ownerId !== uid || data.memberIds.length !== 1)
      throw invalid()
    tx.update(home, { activeInviteId: null })
  })
}
export async function inspectInvitation(value: string): Promise<Invitation> {
  const code = normalizeCode(value)
  if (!/^[a-f0-9]{32}$/.test(code)) throw invalid()
  const { db } = await getFirebaseServices()
  const snapshot = await runTransaction(db, (tx) =>
    tx.get(doc(db, 'householdInvites', code)),
  )
  if (!snapshot.exists()) throw invalid()
  return { ...snapshot.data(), code } as Invitation
}
export async function joinHousehold(uid: string, value: string) {
  const code = normalizeCode(value)
  if (!/^[a-f0-9]{32}$/.test(code)) throw invalid()
  const { db } = await getFirebaseServices()
  await runTransaction(db, async (tx) => {
    const user = doc(db, 'users', uid)
    if ((await tx.get(user)).exists())
      throw Object.assign(new Error('already member'), {
        code: 'already-member',
      })
    const invite = doc(db, 'householdInvites', code),
      snapshot = await tx.get(invite)
    if (!snapshot.exists()) throw invalid()
    const data = snapshot.data()
    tx.set(user, {
      householdId: data.householdId,
      createdAt: serverTimestamp(),
    })
    tx.update(doc(db, 'households', data.householdId), {
      memberIds: arrayUnion(uid),
      activeInviteId: null,
    })
    tx.update(invite, { usedBy: uid, usedAt: serverTimestamp() })
  })
}
export function watchHousehold(
  uid: string,
  next: (household: Household | null) => void,
  error: () => void,
): Unsubscribe {
  let active = true,
    stopUser: Unsubscribe | undefined,
    stopHome: Unsubscribe | undefined
  void getFirebaseServices()
    .then(({ db }) => {
      if (!active) return
      stopUser = onSnapshot(
        doc(db, 'users', uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active || snapshot.metadata.hasPendingWrites) return
          stopHome?.()
          stopHome = undefined
          if (!snapshot.exists()) {
            next(null)
            return
          }
          const id = snapshot.data().householdId as string
          stopHome = onSnapshot(
            doc(db, 'households', id),
            { includeMetadataChanges: true },
            (home) => {
              if (!active || home.metadata.hasPendingWrites) return
              if (home.exists()) next({ ...home.data(), id } as Household)
              else error()
            },
            () => {
              if (active) error()
            },
          )
        },
        () => {
          if (active) error()
        },
      )
    })
    .catch(() => {
      if (active) error()
    })
  return () => {
    active = false
    stopUser?.()
    stopHome?.()
  }
}
