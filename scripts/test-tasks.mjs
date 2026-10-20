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
  url = 'http://127.0.0.1:5178/',
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
    '5178',
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
  })
  const second = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  })
  first.setDefaultTimeout(15000)
  second.setDefaultTimeout(15000)
  const a = await first.newPage(),
    b = await second.newPage(),
    stamp = Date.now()
  const ownerEmail = `task-owner-${stamp}@example.test`,
    partnerEmail = `task-partner-${stamp}@example.test`
  await account(a, ownerEmail)
  await account(b, partnerEmail)
  const name = `ToDo検証用${stamp}`
  await a.getByLabel('世帯名', { exact: true }).fill(name)
  await a.getByRole('button', { name: '世帯を作る', exact: true }).click()
  const nav = (page, label) =>
    page
      .getByRole('navigation')
      .getByRole('link', { name: label, exact: true })
      .click()
  await expect(
    a.getByRole('heading', { name: 'ホーム', exact: true }),
  ).toBeVisible()
  await nav(a, '設定')
  await a.getByLabel('相手のメールアドレス').fill(partnerEmail)
  await a.getByRole('button', { name: '招待コードを発行', exact: true }).click()
  const invite = await a.getByLabel('発行した招待コード').textContent()
  await b.getByLabel('招待コード', { exact: true }).fill(invite)
  await b.getByRole('button', { name: '招待を確認する' }).click()
  await b.getByRole('button', { name: '参加する', exact: true }).click()
  await expect(b.getByText('参加人数：2 / 2人')).toBeVisible()
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  await nav(a, '家事')
  await a.getByLabel('タイトル', { exact: true }).fill('掃除機をかける')
  await a.getByLabel('担当', { exact: true }).selectOption('partner')
  await a.getByLabel('優先度', { exact: true }).selectOption('high')
  await a.getByLabel('期限（任意）', { exact: true }).fill(today)
  await a.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(b.getByText('掃除機をかける', { exact: true })).toBeVisible()
  await expect(b.getByText('担当：自分 · 優先度：高')).toBeVisible()
  await expect(a.getByText('担当：相手 · 優先度：高')).toBeVisible()
  await b
    .getByRole('button', { name: '完了にする：掃除機をかける', exact: true })
    .click()
  await expect(a.getByText('未完了のToDoはありません。')).toBeVisible()
  await expect(
    b.getByText('今日が期限の未完了ToDoはありません。'),
  ).toBeVisible()
  await a.getByRole('button', { name: '完了済み', exact: true }).click()
  await a
    .getByRole('button', { name: '未完了に戻す：掃除機をかける', exact: true })
    .click()
  await expect(b.getByText('掃除機をかける', { exact: true })).toBeVisible()
  await a.getByRole('button', { name: '未完了', exact: true }).click()
  await nav(b, '家事')
  await b
    .getByRole('button', { name: '編集：掃除機をかける', exact: true })
    .click()
  const title = '掃除機をかけて片付ける'
  await b.getByLabel('タイトル', { exact: true }).fill(title)
  await b.getByLabel('担当', { exact: true }).selectOption('both')
  await b.getByLabel('優先度', { exact: true }).selectOption('low')
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(a.getByText(title, { exact: true })).toBeVisible()
  await expect(a.getByText('担当：2人 · 優先度：低')).toBeVisible()
  await a.screenshot({
    path: join(tmpdir(), 'futari-tasks-mobile.png'),
    fullPage: false,
  })
  await b.screenshot({
    path: join(tmpdir(), 'futari-tasks-desktop.png'),
    fullPage: false,
  })
  // 両者が同じ版から編集する。後から保存する側の入力を保持する。
  for (const page of [a, b])
    await page
      .getByRole('button', { name: `編集：${title}`, exact: true })
      .click()
  await a.getByLabel('タイトル', { exact: true }).fill('先に保存したToDo')
  await b.getByLabel('タイトル', { exact: true }).fill('上書きしない下書き')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(b.getByText('先に保存したToDo', { exact: true })).toBeVisible()
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(b.getByRole('status')).toContainText('別の端末')
  await expect(b.getByLabel('タイトル', { exact: true })).toHaveValue(
    '上書きしない下書き',
  )
  await b.getByRole('button', { name: 'キャンセル', exact: true }).click()
  for (const page of [a, b]) {
    await page.reload()
    await expect(
      page.getByText('先に保存したToDo', { exact: true }),
    ).toBeVisible()
  }
  await b
    .getByRole('button', { name: '削除：先に保存したToDo', exact: true })
    .click()
  await b.getByRole('button', { name: '削除をやめる', exact: true }).click()
  await expect(a.getByText('先に保存したToDo', { exact: true })).toBeVisible()
  await b
    .getByRole('button', { name: '削除：先に保存したToDo', exact: true })
    .click()
  await a
    .getByRole('button', { name: '編集：先に保存したToDo', exact: true })
    .click()
  await a.getByLabel('タイトル', { exact: true }).fill('削除前に更新したToDo')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(
    b.getByText('削除前に更新したToDo', { exact: true }),
  ).toBeVisible()
  await b.getByRole('button', { name: '削除する', exact: true }).click()
  await expect(b.getByRole('status')).toContainText('別の端末')
  await expect(
    a.getByText('削除前に更新したToDo', { exact: true }),
  ).toBeVisible()
  await b.getByRole('button', { name: '削除をやめる', exact: true }).click()
  await b
    .getByRole('button', { name: '削除：削除前に更新したToDo', exact: true })
    .click()
  await b.getByRole('button', { name: '削除する', exact: true }).click()
  await expect(a.getByText('未完了のToDoはありません。')).toBeVisible()
  // オフラインではキューへ積まず、再接続後に明示的な再送で1件だけ作成する。
  await second.setOffline(true)
  await b.getByLabel('タイトル', { exact: true }).fill('通信復帰後のToDo')
  await b.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(b.getByRole('status')).toContainText('通信')
  await second.setOffline(false)
  await b.getByRole('button', { name: '追加する', exact: true }).click()
  await expect(a.getByText('通信復帰後のToDo', { exact: true })).toHaveCount(1)
  await expect(b.getByText('通信復帰後のToDo', { exact: true })).toHaveCount(1)
  for (const width of [320, 390]) {
    await a.setViewportSize({ width, height: 844 })
    assert(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await a.locator('footer').scrollIntoViewIfNeeded()
    const footer = await a.locator('footer').boundingBox(),
      menu = await a.getByRole('navigation').boundingBox()
    assert(footer.y + footer.height <= menu.y)
  }
  // 架空データの準備だけRulesを無効化。今日の古いToDoが家事の最新100件外でも取得される。
  const env = await initializeTestEnvironment({
    projectId: project,
    firestore: { host: '127.0.0.1', port: 8080 },
  })
  try {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore()
      const houses = await getDocs(
        query(collection(d, 'households'), where('name', '==', name)),
      )
      const house = houses.docs[0],
        uid = house.data().ownerId
      const batch = writeBatch(d)
      for (let i = 0; i < 113; i++)
        batch.set(doc(d, 'households', house.id, 'tasks', `fixture-${i}`), {
          title: i < 12 ? `今日の確認${i}` : `期限なしの確認${i}`,
          assigneeIds: [],
          dueDate: i < 12 ? today : null,
          priority: 'medium',
          completed: false,
          version: 1,
          createdBy: uid,
          updatedBy: uid,
          createdAt: Timestamp.fromMillis(i < 12 ? i + 1 : Date.now() + i),
          updatedAt: Timestamp.now(),
        })
      await batch.commit()
    })
  } finally {
    await env.cleanup()
  }
  await nav(b, 'ホーム')
  await expect(b.getByText('今日の確認11', { exact: true })).toBeVisible()
  await expect(b.getByText('今日の確認0', { exact: true })).toHaveCount(0)
  await b.getByRole('button', { name: 'さらに10件表示', exact: true }).click()
  await expect(b.getByText('今日の確認0', { exact: true })).toBeVisible()
  await expect(a.getByText('今日の確認0', { exact: true })).toHaveCount(0)
  await a.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(a.getByText('今日の確認0', { exact: true })).toBeVisible()
  await nav(b, '家事')
  await nav(b, '設定')
  await b.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(
    b.getByRole('button', { name: 'ログインする', exact: true }),
  ).toBeVisible()
  await expect(b.getByText('通信復帰後のToDo', { exact: true })).toHaveCount(0)
  await b.getByLabel('メールアドレス', { exact: true }).fill(partnerEmail)
  await b.getByLabel('パスワード', { exact: true }).fill(password)
  await b.getByRole('button', { name: 'ログインする', exact: true }).click()
  await expect(
    b.getByRole('heading', { name: 'ホーム', exact: true }),
  ).toBeVisible()
  await nav(b, '家事')
  await expect(b.getByText('期限なしの確認112', { exact: true })).toBeVisible()
  await b.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(b.getByText('通信復帰後のToDo', { exact: true })).toBeVisible()
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
    'PASS: tasks create/share, viewer-relative assignees, today, complete/undo, edit, stale edit/delete conflicts, offline recovery, finite pagination, reload/logout/login, 320/390/1280 layout, no runtime errors',
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
