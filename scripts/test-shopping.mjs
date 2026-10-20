import assert from 'node:assert/strict'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  Timestamp,
  setLogLevel,
} from 'firebase/firestore'
setLogLevel('silent')
import { request } from 'node:http'
import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
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
  browser = await chromium.launch()
  const first = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    second = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    })
  first.setDefaultTimeout(15000)
  second.setDefaultTimeout(15000)
  const a = await first.newPage(),
    b = await second.newPage(),
    stamp = Date.now(),
    email = `shop-partner-${stamp}@example.test`
  await account(a, `shop-owner-${stamp}@example.test`)
  await account(b, email)
  const nav = (page, label) =>
    page
      .getByRole('navigation')
      .getByRole('link', { name: label, exact: true })
      .click()
  await a.getByLabel('世帯名', { exact: true }).fill(`買い物検証${stamp}`)
  await a.getByRole('button', { name: '世帯を作る', exact: true }).click()
  await expect(
    a.getByRole('heading', { name: 'ホーム', exact: true }),
  ).toBeVisible()
  await nav(a, '設定')
  await a.getByLabel('相手のメールアドレス').fill(email)
  await a.getByRole('button', { name: '招待コードを発行', exact: true }).click()
  const invite = await a.getByLabel('発行した招待コード').textContent()
  await b.getByLabel('招待コード', { exact: true }).fill(invite)
  await b.getByRole('button', { name: '招待を確認する' }).click()
  await b.getByRole('button', { name: '参加する', exact: true }).click()
  await expect(b.getByText('参加人数：2 / 2人')).toBeVisible()
  const card = (page, title) =>
    page
      .getByRole('listitem')
      .filter({ has: page.getByText(title, { exact: true }) })
  const homeList = (page) =>
    page.getByRole('region', { name: '未購入の買い物', exact: true })
  async function addItem(title, priority = '2', category = 'other') {
    await a.getByLabel('商品名', { exact: true }).fill(title)
    await a.getByLabel('カテゴリ', { exact: true }).selectOption(category)
    await a.getByLabel('優先度', { exact: true }).selectOption(priority)
    await a.getByRole('button', { name: '追加する', exact: true }).click()
    await expect(a.getByLabel('商品名', { exact: true })).toHaveValue('')
  }
  await nav(a, '買い物')
  await a.getByLabel('数量', { exact: true }).fill('02.000')
  await a.getByLabel('単位', { exact: true }).fill('本')
  await a.getByLabel('予算（円・任意）', { exact: true }).fill('500')
  await a.getByLabel('担当', { exact: true }).selectOption('partner')
  await addItem('共有する牛乳', '3', 'food')
  await expect(card(b, '共有する牛乳')).toContainText('担当：自分')
  await expect(card(a, '共有する牛乳')).toContainText('担当：相手')
  await expect(card(b, '共有する牛乳')).toContainText('数量：2本')
  await addItem('低優先度の品', '1')
  await addItem('優先する品', '3')
  await expect(homeList(b).getByRole('listitem').first()).toContainText(
    '優先する品',
  )
  await expect(homeList(b).getByRole('listitem').nth(1)).toContainText(
    '共有する牛乳',
  )
  await a
    .getByRole('button', { name: '編集：共有する牛乳', exact: true })
    .click()
  await a.getByLabel('数量', { exact: true }).fill('0.500')
  await a.getByLabel('単位', { exact: true }).fill('kg')
  await a.getByLabel('予算（円・任意）', { exact: true }).fill('0')
  await a.getByLabel('カテゴリ', { exact: true }).selectOption('daily')
  await a.getByLabel('担当', { exact: true }).selectOption('both')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(card(b, '共有する牛乳')).toContainText('数量：0.5kg')
  await expect(card(b, '共有する牛乳')).toContainText('予算：0円')
  await expect(card(b, '共有する牛乳')).toContainText('担当：2人')
  await b
    .getByRole('button', { name: '購入済みにする：共有する牛乳', exact: true })
    .click()
  await expect(b.getByText('共有する牛乳', { exact: true })).toHaveCount(0)
  await a.getByRole('button', { name: '購入済み', exact: true }).click()
  await expect(card(a, '共有する牛乳')).toBeVisible()
  await nav(b, '買い物')
  await b.getByRole('button', { name: '購入済み', exact: true }).click()
  await b
    .getByRole('button', { name: '未購入に戻す：共有する牛乳', exact: true })
    .click()
  await expect(a.getByText('共有する牛乳', { exact: true })).toHaveCount(0)
  for (const page of [a, b])
    await page.getByRole('button', { name: '未購入', exact: true }).click()
  await a
    .getByRole('button', { name: '削除：共有する牛乳', exact: true })
    .click()
  await expect(a.getByRole('group', { name: '削除の確認' })).toContainText(
    '共有する牛乳',
  )
  await a.getByRole('button', { name: '削除をやめる', exact: true }).click()
  await expect(card(a, '共有する牛乳')).toBeVisible()
  await a
    .getByRole('button', { name: '削除：共有する牛乳', exact: true })
    .click()
  await a.getByRole('button', { name: '削除する', exact: true }).click()
  for (const page of [a, b])
    await expect(page.getByText('共有する牛乳', { exact: true })).toHaveCount(0)
  // Both users edit the same version; the loser retains its draft.
  for (const page of [a, b])
    await page
      .getByRole('button', { name: '編集：優先する品', exact: true })
      .click()
  await a.getByLabel('商品名', { exact: true }).fill('最新の優先品')
  await b.getByLabel('商品名', { exact: true }).fill('保持する買い物の下書き')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(card(b, '最新の優先品')).toBeVisible()
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(b.getByRole('status')).toContainText('別の端末')
  await expect(b.getByLabel('商品名', { exact: true })).toHaveValue(
    '保持する買い物の下書き',
  )
  await b.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await b
    .getByRole('button', { name: '削除：最新の優先品', exact: true })
    .click()
  await a
    .getByRole('button', { name: '編集：最新の優先品', exact: true })
    .click()
  await a.getByLabel('商品名', { exact: true }).fill('更新後の優先品')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(card(b, '更新後の優先品')).toBeVisible()
  await b.getByRole('button', { name: '削除する', exact: true }).click()
  await expect(b.getByRole('status')).toContainText('別の端末')
  await expect(card(a, '更新後の優先品')).toBeVisible()
  await b.getByRole('button', { name: '削除をやめる', exact: true }).click()
  await second.setOffline(true)
  await b.evaluate(() => window.dispatchEvent(new Event('offline')))
  await b.getByLabel('商品名', { exact: true }).fill('通信復帰後の品')
  await b.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(
    b
      .locator('form')
      .filter({ has: b.getByLabel('商品名', { exact: true }) })
      .getByRole('status'),
  ).toContainText('通信を確認')
  await expect(b.getByLabel('商品名', { exact: true })).toHaveValue(
    '通信復帰後の品',
  )
  await second.setOffline(false)
  await b.evaluate(() => window.dispatchEvent(new Event('online')))
  await b.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(card(a, '通信復帰後の品')).toBeVisible()
  // Finite home and both category-filtered lists, without summing budgets or exposing total counts.
  const env = await initializeTestEnvironment({
    projectId: project,
    firestore: { host: '127.0.0.1', port: 8080 },
  })
  try {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore(),
        homes = await getDocs(
          query(
            collection(db, 'households'),
            where('name', '==', `買い物検証${stamp}`),
          ),
        ),
        home = homes.docs[0],
        uid = home.data().ownerId,
        batch = writeBatch(db)
      for (const purchased of [false, true])
        for (let i = 0; i < 103; i++)
          batch.set(
            doc(
              db,
              'households',
              home.id,
              'shoppingItems',
              `${purchased ? 'bought' : 'pending'}-${i}`,
            ),
            {
              title: `${purchased ? '購入済み' : '未購入'}追加表示${i}`,
              category: 'furniture',
              quantity: '1',
              unit: '',
              budget: null,
              assigneeIds: [],
              priority: 2,
              purchased,
              version: 1,
              createdAt: Timestamp.fromMillis(i + 1),
              createdBy: uid,
              updatedAt: Timestamp.fromMillis(i + 1),
              updatedBy: uid,
            },
          )
      await batch.commit()
    })
  } finally {
    await env.cleanup()
  }
  await nav(b, 'ホーム')
  await expect(homeList(b).getByRole('listitem')).toHaveCount(5)
  await expect(
    homeList(b).getByText('ほかにもあります', { exact: true }),
  ).toBeVisible()
  await b
    .getByRole('button', {
      name: '購入済みにする：更新後の優先品',
      exact: true,
    })
    .click()
  await expect(homeList(b).getByRole('listitem')).toHaveCount(5)
  await expect(
    homeList(b).getByText('更新後の優先品', { exact: true }),
  ).toHaveCount(0)
  await nav(b, '買い物')
  await b.getByLabel('カテゴリで絞り込み').selectOption('food')
  await expect(b.getByText('未購入の商品はありません。')).toBeVisible()
  await b.getByLabel('カテゴリで絞り込み').selectOption('furniture')
  await expect(b.getByRole('listitem')).toHaveCount(100)
  await expect(b.getByRole('listitem').first()).toContainText(
    '未購入追加表示102',
  )
  await b.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(b.getByRole('listitem')).toHaveCount(103)
  await b.getByRole('button', { name: '購入済み', exact: true }).click()
  await expect(b.getByRole('listitem')).toHaveCount(100)
  await expect(b.getByRole('listitem').first()).toContainText(
    '購入済み追加表示102',
  )
  await b.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(b.getByRole('listitem')).toHaveCount(103)
  await expect(
    b.getByRole('button', { name: 'さらに100件表示', exact: true }),
  ).toHaveCount(0)
  await b.reload()
  await expect(
    b.getByRole('heading', { name: '買い物', exact: true }),
  ).toBeVisible()
  await expect(card(b, '通信復帰後の品')).toBeVisible()
  for (const width of [320, 390, 1280]) {
    await b.setViewportSize({ width, height: 844 })
    assert(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await b.locator('footer').scrollIntoViewIfNeeded()
    const f = await b.locator('footer').boundingBox(),
      n = await b.getByRole('navigation').boundingBox()
    assert(f.y + f.height <= n.y)
  }
  await b.screenshot({
    path: join(tmpdir(), 'futari-shopping-desktop.png'),
    fullPage: false,
  })
  await b.setViewportSize({ width: 390, height: 844 })
  await b.getByRole('listitem').first().scrollIntoViewIfNeeded()
  await b.screenshot({
    path: join(tmpdir(), 'futari-shopping-mobile.png'),
    fullPage: false,
  })
  await nav(b, '設定')
  await b.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(
    b.getByRole('button', { name: 'ログインする', exact: true }),
  ).toBeVisible()
  await expect(b.getByText('通信復帰後の品', { exact: true })).toHaveCount(0)
  await b.getByLabel('メールアドレス', { exact: true }).fill(email)
  await b.getByLabel('パスワード', { exact: true }).fill(password)
  await b.getByRole('button', { name: 'ログインする', exact: true }).click()
  await expect(
    b.getByRole('heading', { name: 'ホーム', exact: true }),
  ).toBeVisible()
  await expect(
    homeList(b).getByText('通信復帰後の品', { exact: true }),
  ).toBeVisible()
  await expect(a.locator('vite-error-overlay')).toHaveCount(0)
  assert.deepEqual(errors, [])
  assert(
    !consoleMessages.some(
      (message) =>
        message.includes(invite) ||
        message.includes(invite.replaceAll('-', '')),
    ),
  )
  console.log(
    'PASS: shopping two isolated browsers, realtime CRUD, quantities/budget/assignees, priority order, purchase/undo/home5+more, category server filters, 103+103 pagination, stale edit/delete conflicts, offline recovery, reload/logout/login, 320/390/1280 layout; no runtime errors',
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
