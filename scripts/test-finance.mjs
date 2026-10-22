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
      date = '2026-10-21',
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

  await a.getByRole('tab', { name: 'カテゴリ管理' }).click()
  await a.getByLabel('カテゴリ名', { exact: true }).fill('趣味')
  await a.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(a.getByLabel('趣味のカテゴリ名')).toBeVisible()
  await b.getByRole('tab', { name: 'カテゴリ管理' }).click()
  await expect(b.getByLabel('趣味のカテゴリ名')).toBeVisible()
  const customCategory = a.getByLabel('趣味のカテゴリ名').locator('xpath=..')
  await a.getByLabel('趣味のカテゴリ名').fill('趣味・娯楽')
  await customCategory.getByRole('button', { name: '名称変更' }).click()
  await expect(b.getByLabel('趣味・娯楽のカテゴリ名')).toBeVisible()

  const foodCategory = a.getByLabel('食費のカテゴリ名').locator('xpath=..')
  await foodCategory.getByRole('button', { name: 'アーカイブ' }).click()
  await expect(b.getByText('食費（アーカイブ）')).toBeVisible()
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
  assert.deepEqual(errors, [])
  console.log(
    'Finance browser integration passed: shared records, totals, edit/delete, category sync, month navigation and reload',
  )
  await first.close()
  await second.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
