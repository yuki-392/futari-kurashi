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
  const email = `purchase-partner-${stamp}@example.test`
  await account(a, `purchase-owner-${stamp}@example.test`)
  await account(b, email)
  const nav = (page, label) =>
    page
      .getByRole('navigation')
      .getByRole('link', { name: label, exact: true })
      .click()
  await a.getByLabel('世帯名', { exact: true }).fill(`購入支出検証${stamp}`)
  await a.getByRole('button', { name: '世帯を作る', exact: true }).click()
  await nav(a, '設定')
  await a.getByLabel('相手のメールアドレス').fill(email)
  await a.getByRole('button', { name: '招待コードを発行', exact: true }).click()
  const invite = await a.getByLabel('発行した招待コード').textContent()
  await b.getByLabel('招待コード', { exact: true }).fill(invite)
  await b.getByRole('button', { name: '招待を確認する' }).click()
  await b.getByRole('button', { name: '参加する', exact: true }).click()

  const card = (page, title) =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByText(title, { exact: true }) })
  const flow = (page) =>
    page.getByRole('group', { name: '購入と支出の確認', exact: true })
  const home = (page) =>
    page.getByRole('region', { name: '今月の家計', exact: true })
  async function add(title) {
    await a.getByLabel('商品名', { exact: true }).fill(title)
    await a.getByLabel('カテゴリ', { exact: true }).selectOption('food')
    await a.getByLabel('予算（円・任意）').fill('500')
    await a.getByLabel('担当', { exact: true }).selectOption('partner')
    await a.getByRole('button', { name: '追加する', exact: true }).click()
    await expect(a.getByLabel('商品名', { exact: true })).toHaveValue('')
  }
  await nav(a, '買い物')
  await nav(b, 'ホーム')
  await add('購入連携の牛乳')
  await expect(card(b, '購入連携の牛乳')).toBeVisible()
  await card(b, '購入連携の牛乳')
    .getByRole('button', {
      name: '購入済みにする：購入連携の牛乳',
      exact: true,
    })
    .click()
  await flow(b).getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(card(a, '購入連携の牛乳')).toBeVisible()
  await card(b, '購入連携の牛乳')
    .getByRole('button', {
      name: '購入済みにする：購入連携の牛乳',
      exact: true,
    })
    .click()
  await flow(b).getByRole('button', { name: '支出も登録', exact: true }).click()
  await expect(flow(b).getByLabel('金額（円）')).toHaveValue('')
  await expect(flow(b).getByLabel('カテゴリ', { exact: true })).toHaveValue(
    'expense_food',
  )
  await expect(flow(b).getByLabel('支払者', { exact: true })).toHaveValue(/.+/)
  await expect(
    flow(b).getByRole('option', { name: '収入', exact: true }),
  ).toHaveCount(0)
  await flow(b).getByLabel('金額（円）').fill('101')
  await flow(b)
    .getByRole('button', { name: '購入して支出を登録', exact: true })
    .click()
  await expect(flow(b)).toHaveCount(0)
  await expect(card(a, '購入連携の牛乳')).toHaveCount(0)
  await expect(home(b)).toContainText('支出：101円')
  await nav(a, '家計')
  await expect(card(a, '購入連携の牛乳')).toContainText('101円')
  await nav(b, '買い物')
  await b.getByRole('button', { name: '購入済み', exact: true }).click()
  await card(b, '購入連携の牛乳')
    .getByRole('button', { name: '編集：購入連携の牛乳', exact: true })
    .click()
  await b.getByLabel('商品名', { exact: true }).fill('買い物だけ変更')
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(card(a, '購入連携の牛乳')).toContainText('101円')
  await expect(card(a, '買い物だけ変更')).toHaveCount(0)
  await card(b, '買い物だけ変更')
    .getByRole('button', { name: '編集：買い物だけ変更', exact: true })
    .click()
  await b.getByLabel('商品名', { exact: true }).fill('購入連携の牛乳')
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await nav(b, 'ホーム')

  await a.getByRole('tab', { name: '精算', exact: true }).click()
  await expect(
    a.getByRole('region', { name: '月別の精算', exact: true }),
  ).toContainText('自分から相手へ 50円')
  await a.getByRole('tab', { name: '予算', exact: true }).click()
  const budget = a.getByRole('region', { name: '月全体の予算', exact: true })
  await budget.getByRole('button', { name: '予算を設定', exact: true }).click()
  await budget.getByLabel('月全体の予算額（円）').fill('1000')
  await budget.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(home(b)).toContainText('残り899円')
  await a.getByRole('tab', { name: '月別明細', exact: true }).click()
  await card(a, '購入連携の牛乳')
    .getByRole('button', { name: '編集', exact: true })
    .click()
  await a.getByLabel('金額（円）').fill('201')
  await a.getByLabel('内容', { exact: true }).fill('家計だけ変更')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(home(b)).toContainText('支出：201円')
  await expect(home(b)).toContainText('残り799円')
  await card(a, '家計だけ変更')
    .getByRole('button', { name: '削除', exact: true })
    .click()
  await a
    .getByRole('group', { name: '削除の確認' })
    .getByRole('button', { name: '削除する', exact: true })
    .click()
  await expect(home(b)).toContainText('支出：0円')
  await nav(b, '買い物')
  await b.getByRole('button', { name: '購入済み', exact: true }).click()
  await expect(card(b, '購入連携の牛乳')).toContainText('支出登録済み')
  await expect(
    card(b, '購入連携の牛乳').getByRole('button', {
      name: '支出に登録：購入連携の牛乳',
      exact: true,
    }),
  ).toHaveCount(0)
  await card(b, '購入連携の牛乳')
    .getByRole('button', { name: '未購入に戻す：購入連携の牛乳', exact: true })
    .click()
  await b.getByRole('button', { name: '未購入', exact: true }).click()
  await card(b, '購入連携の牛乳')
    .getByRole('button', {
      name: '購入済みにする：購入連携の牛乳',
      exact: true,
    })
    .click()
  await expect(
    flow(b).getByRole('button', { name: '支出も登録', exact: true }),
  ).toHaveCount(0)
  await flow(b).getByRole('button', { name: '購入だけ', exact: true }).click()
  await nav(a, '買い物')
  await add('後から支出')
  await card(a, '後から支出')
    .getByRole('button', { name: '購入済みにする：後から支出', exact: true })
    .click()
  await flow(a).getByRole('button', { name: '購入だけ', exact: true }).click()
  await Promise.all([
    a.getByRole('button', { name: '購入済み', exact: true }).click(),
    b.getByRole('button', { name: '購入済み', exact: true }).click(),
  ])
  await card(a, '後から支出')
    .getByRole('button', { name: '支出に登録：後から支出', exact: true })
    .click()
  await flow(a).getByLabel('金額（円）').fill('222')
  await first.setOffline(true)
  await flow(a).getByRole('button', { name: '支出を登録', exact: true }).click()
  await expect(flow(a).getByLabel('金額（円）')).toHaveValue('222')
  await expect(flow(a).getByRole('status')).toContainText('オフライン')
  await first.setOffline(false)
  await card(b, '後から支出')
    .getByRole('button', { name: '支出に登録：後から支出', exact: true })
    .click()
  await flow(b).getByLabel('金額（円）').fill('300')
  await flow(b).getByRole('button', { name: '支出を登録', exact: true }).click()
  await expect(flow(b)).toHaveCount(0)
  await flow(a).getByRole('button', { name: '支出を登録', exact: true }).click()
  await expect(flow(a).getByRole('status')).toContainText('登録済み')
  await expect(flow(a).getByLabel('金額（円）')).toHaveValue('222')
  await flow(a).getByRole('button', { name: 'キャンセル', exact: true }).click()
  await card(a, '後から支出')
    .getByRole('button', { name: '削除：後から支出', exact: true })
    .click()
  await a
    .getByRole('group', { name: '削除の確認' })
    .getByRole('button', { name: '削除する', exact: true })
    .click()
  await nav(b, '家計')
  await expect(card(b, '後から支出')).toContainText('300円')
  await expect(
    b.getByRole('region', { name: '月別の収支', exact: true }),
  ).toContainText('300円')
  await nav(a, 'ホーム')
  await expect(home(a)).toContainText('支出：300円')
  await Promise.all([a.reload(), b.reload()])
  await expect(home(a)).toContainText('支出：300円')
  await expect(card(b, '後から支出')).toBeVisible()
  await nav(a, '買い物')
  await add('削除との競合')
  await card(a, '削除との競合')
    .getByRole('button', { name: '購入済みにする：削除との競合', exact: true })
    .click()
  await flow(a).getByRole('button', { name: '支出も登録', exact: true }).click()
  await flow(a).getByLabel('金額（円）').fill('444')
  await nav(b, '買い物')
  await card(b, '削除との競合')
    .getByRole('button', { name: '削除：削除との競合', exact: true })
    .click()
  await b
    .getByRole('group', { name: '削除の確認' })
    .getByRole('button', { name: '削除する', exact: true })
    .click()
  await flow(a)
    .getByRole('button', { name: '購入して支出を登録', exact: true })
    .click()
  await expect(flow(a).getByLabel('金額（円）')).toHaveValue('444')
  await expect(flow(a).getByRole('status')).toContainText('別の端末')
  for (const width of [320, 390, 1280]) {
    await a.setViewportSize({ width, height: 844 })
    assert.ok(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await expect(a.getByRole('navigation')).toBeVisible()
    await expect(a.locator('vite-error-overlay')).toHaveCount(0)
  }
  await a.setViewportSize({ width: 390, height: 844 })
  await a.screenshot({
    path: '/tmp/futari-shopping-expense-mobile.png',
    fullPage: false,
  })
  await nav(a, '設定')
  await a.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(
    a.getByRole('button', { name: 'ログインする', exact: true }),
  ).toBeVisible()
  await expect(a.getByText('後から支出', { exact: true })).toHaveCount(0)
  await a
    .getByLabel('メールアドレス', { exact: true })
    .fill(`purchase-owner-${stamp}@example.test`)
  await a.getByLabel('パスワード', { exact: true }).fill(password)
  await a.getByRole('button', { name: 'ログインする', exact: true }).click()
  await expect(home(a)).toContainText('支出：300円')
  // A long real list must bring the confirmation into the phone viewport.
  await nav(a, '家計')
  await a.getByLabel('種別', { exact: true }).selectOption('income')
  for (let i = 0; i < 8; i++) {
    await a.getByLabel('内容', { exact: true }).fill(`削除表示検証${i}`)
    await a.getByLabel('金額（円）').fill('100')
    await a.getByRole('button', { name: '登録する', exact: true }).click()
    await expect(a.getByLabel('内容', { exact: true })).toHaveValue('')
  }
  const selected = a
    .getByRole('region', { name: '月別明細', exact: true })
    .getByRole('listitem')
    .first()
  const selectedTitle = await selected.locator('p').first().textContent()
  const source = selected.getByRole('button', { name: '削除', exact: true })
  await source.click()
  const confirmation = a.getByRole('group', { name: '削除の確認', exact: true })
  await expect(confirmation).toBeInViewport()
  await expect(
    confirmation.getByRole('button', { name: '削除する', exact: true }),
  ).toBeFocused()
  await confirmation
    .getByRole('button', { name: 'キャンセル', exact: true })
    .click()
  await expect(source).toBeFocused()
  await expect(source).toBeInViewport()
  await source.click()
  await expect(confirmation).toBeInViewport()
  await a.screenshot({
    path: '/tmp/futari-finance-delete-confirmation.png',
    fullPage: false,
  })
  await confirmation
    .getByRole('button', { name: '削除する', exact: true })
    .click()
  await expect(confirmation).toHaveCount(0)
  await expect(card(a, selectedTitle)).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log(
    'Shopping-expense browser passed: choice/cancel, atomic purchase/expense, actual amount, sharing/rounding, live budgets/totals, later registration, offline/input retention, duplicate/deletion conflicts, independent edits/deletes, reload/logout/login, 320/390/1280 layout',
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
