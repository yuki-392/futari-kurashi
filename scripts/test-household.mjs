import assert from 'node:assert/strict'
import { request } from 'node:http'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium, expect } from '@playwright/test'
const project = 'demo-futari-kurashi',
  url = 'http://127.0.0.1:5177/',
  password = 'Household-Test-Password-123'
const server = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    '--mode',
    'emulator',
    '--host',
    '127.0.0.1',
    '--port',
    '5177',
    '--strictPort',
  ],
  {
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_FIREBASE_API_KEY: 'demo-futari-kurashi-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
      VITE_FIREBASE_PROJECT_ID: project,
      VITE_FIREBASE_APP_ID: '1:1234567890:web:demo-futari-kurashi',
      VITE_USE_FIREBASE_EMULATORS: 'true',
    },
  },
)
server.stdout.on('data', (chunk) => process.stdout.write(chunk))
server.stderr.on('data', (chunk) => process.stderr.write(chunk))
function localRequest(url, body) {
  return new Promise((done, fail) => {
    const req = request(
      url,
      {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
      },
      (res) => {
        let text = ''
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => done({ status: res.statusCode, text }))
      },
    )
    req.on('error', fail)
    req.setTimeout(5000, () => req.destroy(new Error('timeout')))
    req.end(body ? JSON.stringify(body) : undefined)
  })
}
const errors = []
const consoleMessages = []
let browser
async function account(page, email) {
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => consoleMessages.push(message.text()))
  await page.goto(url)
  await page.getByRole('button', { name: '新規登録へ' }).click()
  await page.getByLabel('メールアドレス', { exact: true }).fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByLabel('パスワード（確認）', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('確認メールを送りました')
  const response = await localRequest(
    `http://127.0.0.1:9099/emulator/v1/projects/${project}/oobCodes`,
  )
  const code = JSON.parse(response.text).oobCodes.findLast(
    (item) => item.email === email && item.requestType === 'VERIFY_EMAIL',
  ).oobCode
  const verified = await localRequest(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo',
    { oobCode: code },
  )
  assert.equal(verified.status, 200)
  await page.getByRole('button', { name: '確認しました' }).click()
  await expect(page.getByRole('button', { name: '世帯を作る' })).toBeVisible()
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
  assert.equal(server.exitCode, null)
  browser = await chromium.launch()
  const first = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    second = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const owner = await first.newPage(),
    partner = await second.newPage(),
    stamp = Date.now()
  const email = `partner-${stamp}@example.test`
  await account(owner, `owner-${stamp}@example.test`)
  await account(partner, email)
  await owner.getByLabel('世帯名', { exact: true }).fill('ふたりのテスト世帯')
  await owner.getByRole('button', { name: '世帯を作る', exact: true }).click()
  await expect(owner.getByText('参加人数：1 / 2人')).toBeVisible()
  await owner.getByLabel('相手のメールアドレス').fill(email)
  await owner
    .getByRole('button', { name: '招待コードを発行', exact: true })
    .click()
  const output = owner.getByLabel('発行した招待コード')
  await expect(output).toBeVisible()
  const original = await output.textContent()
  await owner.getByRole('button', { name: '招待コードを再発行' }).click()
  await expect(output).not.toHaveText(original)
  let code = await output.textContent()
  await partner.getByLabel('招待コード', { exact: true }).fill(original)
  await partner.getByRole('button', { name: '招待を確認する' }).click()
  await expect(partner.getByRole('status')).toContainText('招待コードを確認')
  await owner.getByRole('button', { name: '招待を取り消す' }).click()
  await expect(output).toHaveCount(0)
  await partner.getByLabel('招待コード', { exact: true }).fill(code)
  await partner.getByRole('button', { name: '招待を確認する' }).click()
  await expect(partner.getByRole('status')).toContainText('招待コードを確認')
  await owner
    .getByRole('button', { name: '招待コードを発行', exact: true })
    .click()
  await expect(output).toBeVisible()
  code = await output.textContent()
  await owner.reload()
  await expect(owner.getByLabel('発行した招待コード')).toHaveText(code)
  await partner
    .getByLabel('招待コード', { exact: true })
    .fill(code.toUpperCase())
  await partner.getByRole('button', { name: '招待を確認する' }).click()
  await expect(
    partner.getByText('ふたりのテスト世帯に参加しますか？'),
  ).toBeVisible()
  await partner.getByRole('button', { name: '参加する', exact: true }).click()
  for (const page of [owner, partner]) {
    await expect(page.getByText('参加人数：2 / 2人')).toBeVisible()
    await expect(
      page.getByText('自分：参加済み · パートナー：参加済み'),
    ).toBeVisible()
    await page.reload()
    await expect(page.getByText('参加人数：2 / 2人')).toBeVisible()
  }
  await partner.screenshot({
    path: join(tmpdir(), 'futari-household-mobile.png'),
    fullPage: true,
  })
  await owner.setViewportSize({ width: 1280, height: 900 })
  await owner.screenshot({
    path: join(tmpdir(), 'futari-household-desktop.png'),
    fullPage: true,
  })
  await partner.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(
    partner.getByRole('button', { name: 'ログインする' }),
  ).toBeVisible()
  await expect(
    partner.getByText('ふたりのテスト世帯', { exact: true }),
  ).toHaveCount(0)
  await partner.reload()
  await expect(
    partner.getByRole('button', { name: 'ログインする' }),
  ).toBeVisible()
  // 同じブラウザーで別アカウントへ切り替えても前ユーザーの世帯を表示しない。
  await account(partner, `outsider-${stamp}@example.test`)
  await expect(
    partner.getByText('ふたりのテスト世帯', { exact: true }),
  ).toHaveCount(0)
  await expect(
    partner.getByRole('button', { name: '世帯を作る' }),
  ).toBeVisible()
  assert.deepEqual(errors, [])
  for (const secret of [original, code]) {
    assert(
      !consoleMessages.some(
        (message) =>
          message.includes(secret) ||
          message.includes(secret.replaceAll('-', '')),
      ),
      'Invitation must not appear in console logs',
    )
  }
  console.log(
    'PASS: isolated accounts, create, rotate, revoke, preview, atomic join, realtime membership, reload, logout, account switch, mobile/desktop; no runtime errors',
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
