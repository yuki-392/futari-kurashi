export type Household = {
  id: string
  name: string
  ownerId: string
  memberIds: string[]
  activeInviteId: string | null
}
export type Invitation = {
  code: string
  householdId: string
  householdName: string
  targetEmail: string
  createdAt: { toMillis(): number }
  usedBy: string | null
}
export const invalidInvite =
  '招待コードを確認するか、作成者に再発行を依頼してください。'
export function normalizeCode(value: string) {
  return value.replace(/[\s-]/g, '').toLowerCase()
}
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}
export function validateName(value: string) {
  const length = Array.from(value.trim()).length
  return length < 1 || length > 40
    ? '世帯名は1〜40文字で入力してください。'
    : null
}
export function newCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}
export function displayCode(code: string) {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}
export function householdMessage(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  if (code === 'unavailable' || code === 'deadline-exceeded')
    return '通信できませんでした。接続を確認して再度お試しください。'
  if (code === 'permission-denied' || code === 'invalid-invitation')
    return invalidInvite
  if (code === 'already-member')
    return 'すでに世帯に所属しています。画面を再読み込みしてください。'
  return '操作を完了できませんでした。接続を確認して再度お試しください。'
}
