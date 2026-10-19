import { request } from 'node:http'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

// Auth Emulator専用。実サービスへのテストメール送信はしない。
const emulator = 'http://127.0.0.1:9099'
const project = 'demo-futari-kurashi'
const email = `tester-${Date.now()}@example.test`
const password = 'Example-Test-Password-123'
const changed = 'Changed-Test-Password-456'
const profile = await mkdtemp(join(tmpdir(), 'futari-auth-'))
const server = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    '--mode',
    'emulator',
    '--host',
    '127.0.0.1',
    '--port',
    '5176',
    '--strictPort',
  ],
  {
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_FIREBASE_API_KEY: 'demo-futari-kurashi-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-futari-kurashi.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: project,
      VITE_FIREBASE_APP_ID: '1:1234567890:web:demo-futari-kurashi',
      VITE_USE_FIREBASE_EMULATORS: 'true',
    },
  },
)
server.stderr.on('data', (chunk) => process.stderr.write(chunk))
server.stdout.on('data', (chunk) => process.stdout.write(chunk))
const errors = []
let context
const url = 'http://127.0.0.1:5176/'
async function localRequest(url, body) {
  return new Promise((done, fail) => {
    const req = request(
      url,
      {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => done({ status: response.statusCode, text }))
      },
    )
    req.on('error', fail)
    req.setTimeout(5000, () =>
      req.destroy(new Error('Local request timed out')),
    )
    req.end(body ? JSON.stringify(body) : undefined)
  })
}
async function oob(type) {
  const response = await localRequest(
    `${emulator}/emulator/v1/projects/${project}/oobCodes`,
  )
  assert.equal(response.status, 200)
  const data = JSON.parse(response.text)
  const code = data.oobCodes.findLast(
    (entry) => entry.email === email && entry.requestType === type,
  )
  assert(code, `Missing emulator action: ${type}`)
  return code.oobCode
}
async function action(endpoint, body) {
  const response = await localRequest(
    `${emulator}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=demo`,
    body,
  )
  assert.equal(response.status, 200, response.text)
}

try {
  await expect
    .poll(
      async () => {
        try {
          return (await localRequest(url)).status === 200
        } catch {
          return false
        }
      },
      { timeout: 20000 },
    )
    .toBe(true)
  assert.equal(
    server.exitCode,
    null,
    'Test server did not start; refusing to use another server',
  )
  context = await chromium.launchPersistentContext(profile, {
    viewport: { width: 390, height: 844 },
  })
  let page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await expect(page.getByRole('button', { name: '新規登録へ' })).toBeVisible()
  await page.screenshot({
    path: join(tmpdir(), 'futari-auth-login.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({
    path: join(tmpdir(), 'futari-auth-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '新規登録へ' }).click()
  await page.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('メールアドレスを確認')
  await expect(page.getByRole('status')).toBeFocused()
  await expect(page.getByRole('status')).toBeInViewport()
  await page
    .getByLabel('メールアドレス', { exact: true })
    .fill(`typed-${email}`)
  await page.getByLabel('パスワード', { exact: true }).fill('short')
  await page.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('12文字以上')
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('確認用のパスワード')
  await page
    .getByLabel('パスワード（確認）', { exact: true })
    .fill('Different-Password-123')
  await page.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('一致しません')
  await page.screenshot({
    path: join(tmpdir(), 'futari-auth-registration-error.png'),
    fullPage: true,
  })
  await page.getByLabel('パスワード（確認）', { exact: true }).fill(password)
  // 入力イベントなしの値変更も送信時に取得する。OS自動入力そのものの代替検証ではない。
  await page
    .getByLabel('メールアドレス', { exact: true })
    .evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set.call(input, value)
    }, email)
  await page.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'メールを確認してください' }),
  ).toBeVisible()
  await expect(page.getByRole('status')).toContainText('確認メールを送りました')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'メールを確認してください' }),
  ).toBeVisible()
  await action('update', { oobCode: await oob('VERIFY_EMAIL') })
  await page.getByRole('button', { name: '確認しました' }).click()
  await expect(
    page.getByRole('heading', { name: 'ふたりの世帯を設定' }),
  ).toBeVisible()
  await page.screenshot({
    path: join(tmpdir(), 'futari-auth-signed-in.png'),
    fullPage: true,
  })
  await context.close()
  context = await chromium.launchPersistentContext(profile, {
    viewport: { width: 390, height: 844 },
  })
  page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await expect(
    page.getByRole('heading', { name: 'ふたりの世帯を設定' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'ログインする', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'パスワードを忘れた方' }).click()
  await page.getByLabel('メールアドレス', { exact: true }).fill(email)
  await page.getByRole('button', { name: '再設定メールを送る' }).click()
  await expect(page.getByRole('status')).toContainText('登録されている場合')
  await action('resetPassword', {
    oobCode: await oob('PASSWORD_RESET'),
    newPassword: changed,
  })
  await page.getByRole('button', { name: 'ログインへ' }).click()
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'ログインする', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(
    'メールアドレスまたはパスワードを確認',
  )
  await page.getByLabel('パスワード', { exact: true }).fill(changed)
  await page.getByRole('button', { name: 'ログインする', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'ふたりの世帯を設定' }),
  ).toBeVisible()
  assert.deepEqual(errors, [])
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  console.log(
    'PASS: register, verification gate, emulator email confirmation, token refresh, browser restart persistence, logout, reset, old password rejected, new password login',
  )
} finally {
  await context?.close()
  server.kill('SIGTERM')
  await rm(profile, { recursive: true, force: true })
}
