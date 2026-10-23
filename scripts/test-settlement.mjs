import assert from 'node:assert/strict'
import { request } from 'node:http'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const project = 'demo-futari-kurashi',
  url = 'http://127.0.0.1:5181/',
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
    '5181',
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
let browser
async function account(page, email) {
  page.on('pageerror', (error) => errors.push(error.message))
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
  browser = await chromium.launch()
  const first = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const second = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  })
  first.setDefaultTimeout(15000)
  second.setDefaultTimeout(15000)
  const a = await first.newPage(),
    b = await second.newPage(),
    stamp = Date.now()
  const email = `settlement-partner-${stamp}@example.test`
  await account(a, `settlement-owner-${stamp}@example.test`)
  await account(b, email)
  const nav = (page, label) =>
    page
      .getByRole('navigation')
      .getByRole('link', { name: label, exact: true })
      .click()
  await a.getByLabel('世帯名', { exact: true }).fill(`家計検証${stamp}`)
  await a.getByRole('button', { name: '世帯を作る', exact: true }).click()
  await nav(a, '設定')
  await a.getByLabel('相手のメールアドレス').fill(email)
  await a.getByRole('button', { name: '招待コードを発行', exact: true }).click()
  const invite = await a.getByLabel('発行した招待コード').textContent()
  await b.getByLabel('招待コード', { exact: true }).fill(invite)
  await b.getByRole('button', { name: '招待を確認する' }).click()
  await b.getByRole('button', { name: '参加する', exact: true }).click()
  await Promise.all([nav(a, '家計'), nav(b, '家計')])
  await expect(a.getByLabel('カテゴリ')).toContainText('食費')
  await expect(b.getByLabel('カテゴリ')).toContainText('食費')

  const item = (page, title) =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByText(title, { exact: true }) })
  const monthly = (page) =>
    page.getByRole('region', { name: '月別の精算', exact: true })
  async function tab(page, name) {
    await page.getByRole('tab', { name, exact: true }).click()
  }
  async function add(page, title, amount) {
    await page.getByLabel('内容', { exact: true }).fill(title)
    await page.getByLabel('金額（円）', { exact: true }).fill(String(amount))
    await page.getByRole('button', { name: '登録する', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('明細を登録しました')
  }
  async function record(page) {
    await page
      .getByRole('button', { name: '支払いを記録する', exact: true })
      .click()
    await page
      .getByRole('button', { name: '確定して記録', exact: true })
      .click()
    await expect(page.getByRole('status')).toContainText('精算金を記録しました')
  }
  await add(a, '折半101円', 101)
  await expect(item(b, '折半101円')).toContainText('支払者：相手')
  await Promise.all([tab(a, '精算'), tab(b, '精算')])
  await expect(monthly(a)).toContainText('自分：支払額 101円 ／ 負担額 51円')
  await expect(a.getByTestId('settlement-remaining')).toContainText(
    '相手から自分へ 50円',
  )
  await expect(b.getByTestId('settlement-remaining')).toContainText(
    '自分から相手へ 50円',
  )
  await b.getByRole('button', { name: '部分払いを記録', exact: true }).click()
  await b.getByLabel('精算金（円）').fill('20')
  await record(b)
  await expect(a.getByTestId('settlement-remaining')).toContainText('30円')
  await expect(monthly(a)).toContainText('元の精算額：相手から自分へ 50円')
  await expect(a.getByTestId('settlement-all')).toContainText('30円')
  // Two independent forms with the same displayed revision: a stale confirmation must fail.
  await a.getByRole('button', { name: '残額を精算済みにする' }).click()
  await b.getByRole('button', { name: '残額を精算済みにする' }).click()
  await record(b)
  await a.getByRole('button', { name: '支払いを記録する', exact: true }).click()
  await a.getByRole('button', { name: '確定して記録', exact: true }).click()
  await expect(a.getByRole('status')).toContainText('別の端末で変更')
  await expect(a.getByLabel('精算金（円）')).toHaveValue('30')
  await expect(a.getByTestId('settlement-remaining')).toContainText(
    '精算の差額はありません',
  )
  await a.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(
    a.getByRole('region', { name: '精算金の記録' }).locator('article'),
  ).toHaveCount(2)
  await expect(a.getByRole('region', { name: '全期間の未精算' })).toContainText(
    '未精算の月はありません',
  )
  // A later edit reopens only the difference; payments never change monthly original calculation.
  await tab(a, '月別明細')
  await item(a, '折半101円')
    .getByRole('button', { name: '編集', exact: true })
    .click()
  await a.getByLabel('金額（円）').fill('201')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(b.getByTestId('settlement-remaining')).toContainText(
    '自分から相手へ 50円',
  )
  await tab(a, '精算')
  await expect(monthly(a)).toContainText('元の精算額：相手から自分へ 100円')
  // Cancel the first partial payment, keeping the actual payment and cancellation actor visible.
  await a
    .getByRole('region', { name: '精算金の記録' })
    .locator('article')
    .filter({ hasText: '20円' })
    .getByRole('button')
    .click()
  await a.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(a.getByTestId('settlement-remaining')).toContainText('50円')
  await a
    .getByRole('region', { name: '精算金の記録' })
    .locator('article')
    .filter({ hasText: '20円' })
    .getByRole('button')
    .click()
  await a.getByRole('button', { name: '取消を確定する', exact: true }).click()
  await expect(b.getByTestId('settlement-remaining')).toContainText('70円')
  await expect(b.getByRole('region', { name: '精算金の記録' })).toContainText(
    '取消済み（取消者：相手）',
  )
  // Overpay and explicit direction, then a personal expense does not affect settlement.
  await b.getByRole('button', { name: '部分払いを記録' }).click()
  await b.getByLabel('精算金（円）').fill('100')
  await b.getByRole('button', { name: '支払いを記録する', exact: true }).click()
  await expect(b.getByText(/残額を超えるか/)).toBeVisible()
  await b.getByRole('button', { name: '確定して記録', exact: true }).click()
  await expect(a.getByTestId('settlement-remaining')).toContainText(
    '自分から相手へ 30円',
  )
  await tab(a, '月別明細')
  await a.getByLabel('精算対象にする').uncheck()
  await add(a, '個人の支出', 999)
  await expect(b.getByTestId('settlement-remaining')).toContainText(
    '相手から自分へ 30円',
  )
  // Delete changes source calculation while keeping payment records.
  await item(a, '折半101円')
    .getByRole('button', { name: '削除', exact: true })
    .click()
  await a
    .getByRole('group', { name: '削除の確認' })
    .getByRole('button', { name: '削除する', exact: true })
    .click()
  await expect(b.getByTestId('settlement-remaining')).toContainText(
    '相手から自分へ 130円',
  )
  await a.reload()
  await nav(a, '家計')
  await tab(a, '精算')
  await expect(a.getByTestId('settlement-remaining')).toContainText(
    '自分から相手へ 130円',
  )
  await expect(
    a.getByRole('region', { name: '精算金の記録' }).locator('article'),
  ).toHaveCount(3)
  // Opposite months net to zero globally without hiding either unpaid month.
  await tab(a, '月別明細')
  const current = new Date(),
    previous = new Date(
      Date.UTC(current.getFullYear(), current.getMonth() - 1, 1),
    )
      .toISOString()
      .slice(0, 7)
  await a.getByLabel('精算対象にする').check()
  await a.getByLabel('日付', { exact: true }).fill(`${previous}-01`)
  await add(a, '前月の折半', 260)
  await tab(a, '精算')
  await expect(a.getByTestId('settlement-all')).toContainText(
    '精算の差額はありません',
  )
  await expect(a.getByRole('region', { name: '全期間の未精算' })).toContainText(
    '未精算の月があります',
  )
  await expect(
    a.getByRole('region', { name: '全期間の未精算' }).getByRole('listitem'),
  ).toHaveCount(2)
  await a.getByRole('button', { name: '前の月' }).click()
  await expect(a.getByTestId('settlement-remaining')).toContainText(
    '相手から自分へ 130円',
  )
  await a.getByRole('button', { name: '次の月' }).click()
  await expect(a.getByTestId('settlement-remaining')).toContainText(
    '自分から相手へ 130円',
  )
  for (const width of [320, 390, 1280]) {
    await a.setViewportSize({ width, height: 844 })
    assert.ok(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `settlement overflow at ${width}`,
    )
  }
  await a.setViewportSize({ width: 390, height: 844 })
  await a.screenshot({
    path: '/tmp/futari-settlement-mobile.png',
    fullPage: true,
  })
  await b.screenshot({
    path: '/tmp/futari-settlement-desktop.png',
    fullPage: true,
  })
  assert.match(await a.title(), /^ふたりの暮らし/)
  await expect(a.locator('vite-error-overlay')).toHaveCount(0)
  await nav(a, '設定')
  await a.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(a.getByRole('region', { name: '月別の精算' })).toHaveCount(0)
  await expect(b.getByTestId('settlement-remaining')).toContainText('130円')
  await a
    .getByLabel('メールアドレス', { exact: true })
    .fill(`settlement-owner-${stamp}@example.test`)
  await a.getByLabel('パスワード', { exact: true }).fill(password)
  await a.getByRole('button', { name: 'ログインする', exact: true }).click()
  await nav(a, '家計')
  await tab(a, '精算')
  await expect(a.getByTestId('settlement-remaining')).toContainText('130円')
  assert.deepEqual(errors, [])
  console.log(
    'Settlement browser passed: sharing/rounding, partial/full, stale concurrent payment rejected, immutable monthly base, overpayment/reverse, cancel, expense edit/delete, reload/logout/login, 320/390/1280 layout',
  )
  await first.close()
  await second.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
