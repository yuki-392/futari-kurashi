import assert from 'node:assert/strict'
import { request } from 'node:http'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
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
  const email = `finance-partner-${stamp}@example.test`
  await account(a, `finance-owner-${stamp}@example.test`)
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
  async function add(
    page,
    {
      title,
      type = 'expense',
      amount,
      category = 'expense_food',
      date = today,
      memo = '',
    },
  ) {
    await page.getByLabel('種別').selectOption(type)
    await page.getByLabel('内容').fill(title)
    await page.getByLabel('金額（円）').fill(String(amount))
    await page.getByLabel('日付').fill(date)
    await page.getByLabel('カテゴリ').selectOption(category)
    await page.getByLabel('メモ（任意）').fill(memo)
    await page.getByRole('button', { name: '登録する', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('明細を登録しました')
  }
  await add(a, { title: '共有した食費', amount: 1200, memo: '夕食' })
  await expect(item(b, '共有した食費')).toContainText('1,200円')
  await expect(a.getByRole('region', { name: '月別の収支' })).toContainText(
    '1,200円',
  )
  await add(b, {
    title: '共有した給与',
    type: 'income',
    amount: 280000,
    category: 'income_salary',
  })
  await expect(item(a, '共有した給与')).toContainText('280,000円')
  await expect(a.getByRole('region', { name: '月別の収支' })).toContainText(
    '280,000円',
  )

  await item(a, '共有した食費').getByRole('button', { name: '編集' }).click()
  await a.getByLabel('金額（円）').fill('1500')
  await a.getByLabel('メモ（任意）').fill('更新後')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(item(b, '共有した食費')).toContainText('1,500円')
  await expect(item(b, '共有した食費')).toContainText('更新後')

  // Budget flows use the same test household and independent browser contexts.
  const budgetRegion = (page, name) =>
    page.getByRole('region', { name: `${name}の予算`, exact: true })
  async function setBudget(page, name, amount) {
    const region = budgetRegion(page, name)
    await region.getByRole('button', { name: /^予算を(設定|編集)$/ }).click()
    await region.getByLabel(`${name}の予算額（円）`).fill(String(amount))
    await region.getByRole('button', { name: '保存する', exact: true }).click()
    await expect(region.getByRole('status')).toHaveText('予算を保存しました。')
    await expect(
      region.getByText(`予算：${Number(amount).toLocaleString('ja-JP')}円`, {
        exact: true,
      }),
    ).toBeVisible()
  }
  await a.getByRole('tab', { name: '予算', exact: true }).click()
  await b.getByRole('tab', { name: '予算', exact: true }).click()
  await setBudget(a, '月全体', 1000)
  await expect(budgetRegion(b, '月全体')).toContainText('500円超過')
  await setBudget(b, '食費', 2000)
  await expect(budgetRegion(a, '食費')).toContainText('残り500円')
  await setBudget(a, '月全体', 0)
  await expect(budgetRegion(b, '月全体')).toContainText('1,500円超過')
  await a.getByRole('button', { name: '前の月' }).click()
  await setBudget(a, '月全体', 5000)
  await setBudget(a, '食費', 2500)
  await a.getByRole('button', { name: '次の月' }).click()
  const food = budgetRegion(a, '食費')
  await food.getByRole('button', { name: '設定を解除', exact: true }).click()
  await food.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(food).toContainText('予算：2,000円')
  await food.getByRole('button', { name: '設定を解除', exact: true }).click()
  await food.getByRole('button', { name: '解除する', exact: true }).click()
  await expect(food).toContainText('予算：未設定')
  await Promise.all(
    [a, b].map(async (page) =>
      page.getByRole('button', { name: '前月からコピー', exact: true }).click(),
    ),
  )
  await expect(food).toContainText('予算：2,500円')
  await expect(budgetRegion(b, '食費')).toContainText('予算：2,500円')
  await expect(budgetRegion(a, '月全体')).toContainText('予算：0円')
  await a.getByRole('button', { name: '前月からコピー', exact: true }).click()
  await expect(
    a.getByText(/コピー結果：成功0件・スキップ2件・失敗0件/),
  ).toBeVisible()

  // Keep an old edit open while the other browser saves.
  await budgetRegion(b, '月全体')
    .getByRole('button', { name: '予算を編集' })
    .click()
  await budgetRegion(b, '月全体')
    .getByLabel('月全体の予算額（円）')
    .fill('2345')
  await setBudget(a, '月全体', 1000)
  await budgetRegion(b, '月全体')
    .getByRole('button', { name: '保存する' })
    .click()
  await expect(budgetRegion(b, '月全体')).toContainText('別の端末で変更')
  await expect(
    budgetRegion(b, '月全体').getByLabel('月全体の予算額（円）'),
  ).toHaveValue('2345')
  await budgetRegion(b, '月全体')
    .getByRole('button', { name: 'キャンセル' })
    .click()
  await nav(a, 'ホーム')
  await expect(a.getByRole('region', { name: '今月の家計' })).toContainText(
    '500円超過',
  )
  await b.getByRole('tab', { name: '月別明細' }).click()
  await add(b, { title: '予算の追加支出', amount: 500 })
  await expect(a.getByRole('region', { name: '今月の家計' })).toContainText(
    '1,000円超過',
  )
  await item(b, '予算の追加支出').getByRole('button', { name: '編集' }).click()
  await b.getByLabel('金額（円）').fill('700')
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(a.getByRole('region', { name: '今月の家計' })).toContainText(
    '1,200円超過',
  )
  await item(b, '予算の追加支出')
    .getByRole('button', { name: '削除', exact: true })
    .click()
  await b
    .getByRole('group', { name: '削除の確認' })
    .getByRole('button', { name: '削除する', exact: true })
    .click()
  await expect(a.getByRole('region', { name: '今月の家計' })).toContainText(
    '500円超過',
  )
  await nav(a, '家計')
  await a.getByRole('tab', { name: '予算', exact: true }).click()
  await a.reload()
  await expect(budgetRegion(a, '月全体')).toHaveCount(0) // tab starts at entries after a real reload
  await a.getByRole('tab', { name: '予算', exact: true }).click()
  await expect(budgetRegion(a, '月全体')).toContainText('予算：1,000円')
  await a.getByRole('tab', { name: '月別明細' }).click()
  await a.getByRole('tab', { name: 'カテゴリ管理' }).click()
  await a.getByLabel('カテゴリ名', { exact: true }).fill('趣味')
  await a.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(a.getByLabel('趣味のカテゴリ名')).toBeVisible()
  await b.getByRole('tab', { name: 'カテゴリ管理' }).click()
  await expect(b.getByLabel('趣味のカテゴリ名')).toBeVisible()
  await b.getByRole('tab', { name: '予算', exact: true }).click()
  await setBudget(b, '趣味', 3000)
  await b.getByRole('tab', { name: 'カテゴリ管理' }).click()
  const customCategory = a.getByLabel('趣味のカテゴリ名').locator('xpath=..')
  await a.getByLabel('趣味のカテゴリ名').fill('趣味・娯楽')
  await customCategory.getByRole('button', { name: '名称変更' }).click()
  await expect(b.getByLabel('趣味・娯楽のカテゴリ名')).toBeVisible()
  await b.getByRole('tab', { name: '予算', exact: true }).click()
  await expect(budgetRegion(b, '趣味・娯楽')).toContainText('予算：3,000円')
  await b.getByRole('tab', { name: 'カテゴリ管理' }).click()

  const foodCategory = a.getByLabel('食費のカテゴリ名').locator('xpath=..')
  await foodCategory.getByRole('button', { name: 'アーカイブ' }).click()
  await expect(b.getByText('食費（アーカイブ）')).toBeVisible()
  await b.getByRole('tab', { name: '予算', exact: true }).click()
  await expect(budgetRegion(b, '食費')).toContainText('アーカイブ')
  await expect(budgetRegion(b, '食費')).toContainText('予算：2,500円')
  await expect(
    budgetRegion(b, '食費').getByRole('button', { name: '予算を編集' }),
  ).toHaveCount(0)
  await b.getByRole('tab', { name: 'カテゴリ管理' }).click()
  await b.getByRole('tab', { name: '月別明細' }).click()
  await expect(item(b, '共有した食費')).toContainText('食費')
  await b.getByRole('tab', { name: 'カテゴリ管理' }).click()
  await b
    .getByText('食費（アーカイブ）')
    .locator('xpath=..')
    .getByRole('button', { name: '再開' })
    .click()
  await expect(a.getByLabel('食費のカテゴリ名')).toBeVisible()

  await a.getByRole('tab', { name: '月別明細' }).click()
  await item(a, '共有した食費').getByRole('button', { name: '削除' }).click()
  await a
    .getByRole('group', { name: '削除の確認' })
    .getByRole('button', { name: 'キャンセル' })
    .click()
  await expect(item(a, '共有した食費')).toBeVisible()
  await item(a, '共有した食費').getByRole('button', { name: '削除' }).click()
  await a
    .getByRole('group', { name: '削除の確認' })
    .getByRole('button', { name: '削除する' })
    .click()
  await expect(a.getByText('共有した食費', { exact: true })).toHaveCount(0)
  await expect(b.getByText('共有した食費', { exact: true })).toHaveCount(0)

  await a.reload()
  await b.reload()
  await nav(a, '家計')
  await nav(b, '家計')
  await expect(item(a, '共有した給与')).toBeVisible()
  await expect(item(b, '共有した給与')).toBeVisible()
  await a.getByRole('button', { name: '前の月' }).click()
  await expect(a.getByText('この月の明細はありません。')).toBeVisible()
  await a.getByRole('tab', { name: '予算', exact: true }).click()
  for (const width of [320, 390, 1280]) {
    await a.setViewportSize({ width, height: 844 })
    assert.ok(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `budget layout overflows at ${width}`,
    )
  }
  await nav(a, '設定')
  await a.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(a.getByRole('region', { name: '今月の家計' })).toHaveCount(0)
  await a
    .getByLabel('メールアドレス', { exact: true })
    .fill(`finance-owner-${stamp}@example.test`)
  await a.getByLabel('パスワード', { exact: true }).fill(password)
  await a.getByRole('button', { name: 'ログインする', exact: true }).click()
  await expect(a.getByRole('region', { name: '今月の家計' })).toContainText(
    '月予算：1,000円',
  )
  assert.deepEqual(errors, [])
  console.log(
    'Finance browser integration passed: shared records, immediate totals, budgets/0/unset, partial-safe concurrent copying, conflicts, home live balances, archives, month navigation and reload',
  )
  await first.close()
  await second.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
