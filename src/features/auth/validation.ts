export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? null
    : 'メールアドレスを確認してください。'
}
export function validateRegistration(
  email: string,
  password: string,
  confirmation: string,
) {
  const invalidEmail = validateEmail(email)
  if (invalidEmail) return invalidEmail
  if (password.length < 12) return 'パスワードは12文字以上にしてください。'
  if (!confirmation) return '確認用のパスワードも入力してください。'
  if (password !== confirmation) return 'パスワードが一致しません。'
  return null
}
export function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''
}
export function authMessage(error: unknown) {
  switch (errorCode(error)) {
    case 'auth/network-request-failed':
      return '通信できませんでした。接続を確認して再度お試しください。'
    case 'auth/too-many-requests':
      return '操作が続いています。少し時間を置いてお試しください。'
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'パスワードは12文字以上にしてください。'
    case 'auth/email-already-in-use':
      return '登録できませんでした。入力を確認するか、ログイン・パスワード再設定をお試しください。'
    case 'auth/invalid-email':
      return 'メールアドレスを確認してください。'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'メールアドレスまたはパスワードを確認してください。'
    default:
      return '操作を完了できませんでした。時間を置いて再度お試しください。'
  }
}
