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
  url = 'http://127.0.0.1:5179/',
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
    '5179',
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
    email = `rec-partner-${stamp}@example.test`
  await account(a, `rec-owner-${stamp}@example.test`)
  await account(b, email)
  const nav = (page, label) =>
    page
      .getByRole('navigation')
      .getByRole('link', { name: label, exact: true })
      .click()
  const section = (page, label) =>
    page
      .getByRole('group', { name: '家事の表示' })
      .getByRole('button', { name: label, exact: true })
      .click()
  await a.getByLabel('世帯名', { exact: true }).fill(`繰り返し検証${stamp}`)
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
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
    add = (value, days) =>
      new Date(new Date(value + 'T00:00:00Z').getTime() + days * 86400000)
        .toISOString()
        .slice(0, 10),
    tomorrow = add(today, 1)
  // Item 8B: shared cleaning, rotation is based on the assigned person, not the actor.
  await nav(a, '家事')
  await section(a, '掃除')
  await a.getByRole('button', { name: '掃除を登録する', exact: true }).click()
  await a.getByLabel('タイトル', { exact: true }).fill('交代する台所掃除')
  await a.getByLabel('掃除場所', { exact: true }).fill(' 台所 ')
  await a.getByLabel('担当を交代する', { exact: true }).check()
  await a.getByLabel('頻度', { exact: true }).selectOption('daily')
  await a.getByRole('button', { name: '登録する', exact: true }).click()
  await nav(b, '家事')
  await section(b, '掃除')
  const cleanTitle = '交代する台所掃除',
    cleanCard = (page) =>
      page
        .getByRole('listitem')
        .filter({ has: page.getByText(cleanTitle, { exact: true }) })
  await expect(cleanCard(b)).toContainText('担当：相手')
  await expect(cleanCard(a)).toContainText('場所：台所')
  await a.screenshot({
    path: join(tmpdir(), 'futari-cleaning-mobile.png'),
    fullPage: false,
  })
  await b
    .getByRole('button', { name: `完了にする：${cleanTitle}`, exact: true })
    .click()
  await expect(b.getByText(cleanTitle, { exact: true })).toHaveCount(0)
  await section(a, '繰り返し')
  await expect(cleanCard(a)).toContainText(`次回：${tomorrow}`)
  await expect(cleanCard(a)).toContainText('担当：相手')
  await section(b, '掃除')
  await b.getByRole('button', { name: '今週', exact: true }).click()
  await expect(b.getByText(/未完了を順に完了した場合/)).toBeVisible()
  if (new Date(today + 'T00:00:00Z').getUTCDay() !== 0) {
    await expect(cleanCard(b)).toContainText('担当：自分')
    await expect(
      b.getByRole('button', { name: `完了にする：${cleanTitle}` }),
    ).toHaveCount(1)
  }
  await section(a, '履歴')
  await expect(a.getByText('場所：台所', { exact: true })).toBeVisible()
  await expect(a.getByText('完了を記録：相手', { exact: false })).toBeVisible()
  await a
    .getByRole('button', { name: `完了を取り消す：${cleanTitle}`, exact: true })
    .click()
  await expect(a.getByText(/取消済み/)).toBeVisible()
  await b.getByRole('button', { name: '今日', exact: true }).click()
  await expect(cleanCard(b)).toContainText('担当：相手')
  await b.getByLabel('場所で絞り込み').fill('別の場所')
  await b.getByRole('button', { name: '適用', exact: true }).click()
  await expect(b.getByText('対象の掃除はありません。')).toBeVisible()
  await b.getByLabel('場所で絞り込み').fill('台所')
  await b.getByRole('button', { name: '適用', exact: true }).click()
  await expect(cleanCard(b)).toBeVisible()
  await b
    .getByRole('button', { name: `完了にする：${cleanTitle}`, exact: true })
    .click()
  await expect(a.getByText(cleanTitle, { exact: true })).toHaveCount(2)
  await expect(
    a.getByRole('button', { name: `完了を取り消す：${cleanTitle}` }),
  ).toHaveCount(1)
  await section(a, '繰り返し')
  await a
    .getByRole('button', { name: `編集：${cleanTitle}`, exact: true })
    .click()
  await a.getByLabel('次回予定', { exact: true }).fill(today)
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(cleanCard(b)).toContainText('担当：自分')
  await section(b, '履歴')
  await expect(
    b.getByRole('button', { name: `完了を取り消す：${cleanTitle}` }),
  ).toHaveCount(0)
  await section(b, '掃除')
  await a
    .getByRole('button', { name: `一時停止：${cleanTitle}`, exact: true })
    .click()
  await expect(b.getByText(cleanTitle, { exact: true })).toHaveCount(0)
  await a
    .getByRole('button', { name: `再開：${cleanTitle}`, exact: true })
    .click()
  await expect(cleanCard(b)).toContainText('担当：自分')
  await b.reload()
  await section(b, '掃除')
  await expect(cleanCard(b)).toContainText('場所：台所')
  for (const width of [320, 390, 1280]) {
    await b.setViewportSize({ width, height: 844 })
    assert(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
  }
  await b.screenshot({
    path: join(tmpdir(), 'futari-cleaning-desktop.png'),
    fullPage: false,
  })
  // Move paused test definition after legacy pagination fixtures.
  await a
    .getByRole('button', { name: `編集：${cleanTitle}`, exact: true })
    .click()
  await a.getByLabel('次回予定', { exact: true }).fill('2096-01-01')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await a
    .getByRole('button', { name: `一時停止：${cleanTitle}`, exact: true })
    .click()
  await nav(b, 'ホーム')
  await expect(b.getByText(cleanTitle, { exact: true })).toHaveCount(0)
  console.log(
    'PASS: cleaning two browsers create/share, assignee rotation by assigned UID, history location/actor, undo/recomplete, editing, pause/resume, today/week, exact server filter, reload, 320/390/1280 layout',
  )
  await nav(a, '家事')
  await section(a, '繰り返し')
  const title = '毎日の片付け'
  await a.getByLabel('タイトル', { exact: true }).fill(title)
  await a.getByLabel('担当', { exact: true }).selectOption('partner')
  await a.getByLabel('頻度', { exact: true }).selectOption('daily')
  await a.getByLabel('開始日', { exact: true }).fill(today)
  await a.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(b.getByText(title, { exact: true })).toBeVisible()
  await expect(b.getByText('担当：自分 · 優先度：中')).toBeVisible()
  await b
    .getByRole('button', { name: `完了にする：${title}`, exact: true })
    .click()
  await expect(b.getByText(title, { exact: true })).toHaveCount(0)
  await expect(
    a.getByText(`毎日 · 次回：${tomorrow}`, { exact: true }),
  ).toBeVisible()
  await section(a, '履歴')
  await expect(
    a
      .getByRole('listitem')
      .filter({ has: a.getByText(title, { exact: true }) })
      .getByText('完了を記録：相手', { exact: false }),
  ).toBeVisible()
  await a
    .getByRole('button', { name: `完了を取り消す：${title}`, exact: true })
    .click()
  await expect(
    a
      .getByRole('listitem')
      .filter({ has: a.getByText(title, { exact: true }) })
      .getByText(/取消済み/),
  ).toBeVisible()
  await expect(b.getByText(title, { exact: true })).toBeVisible()
  await b
    .getByRole('button', { name: `完了にする：${title}`, exact: true })
    .click()
  await expect(a.getByText(title, { exact: true })).toHaveCount(2)
  await expect(
    a.getByRole('button', { name: `完了を取り消す：${title}`, exact: true }),
  ).toHaveCount(1)
  await a.screenshot({
    path: join(tmpdir(), 'futari-recurring-history-mobile.png'),
    fullPage: false,
  })
  await section(a, '繰り返し')
  await a.getByRole('button', { name: `編集：${title}`, exact: true }).click()
  await a.getByLabel('タイトル', { exact: true }).fill('編集した毎日の片付け')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await section(a, '履歴')
  await expect(a.getByRole('button', { name: /完了を取り消す/ })).toHaveCount(0)
  await section(a, '繰り返し')
  await nav(b, '家事')
  await section(b, '繰り返し')
  const edited = '編集した毎日の片付け'
  await expect(b.getByText(edited, { exact: true })).toBeVisible()
  await expect(
    b.getByText(`毎日 · 次回：${tomorrow}`, { exact: true }),
  ).toBeVisible()
  // 停止/再開と完了が競合した場合も古い版の操作を通さない。
  await a
    .getByRole('button', { name: `一時停止：${edited}`, exact: true })
    .click()
  await expect(
    b.getByText(`毎日 · 次回：${tomorrow} · 一時停止中`, { exact: true }),
  ).toBeVisible()
  await expect(
    b.getByRole('button', { name: `完了にする：${edited}`, exact: true }),
  ).toHaveCount(0)
  await b.getByRole('button', { name: `再開：${edited}`, exact: true }).click()
  await expect(
    a.getByRole('button', { name: `完了にする：${edited}`, exact: true }),
  ).toBeVisible()
  await b
    .getByRole('button', { name: `完了にする：${edited}`, exact: true })
    .click()
  await expect(
    a.getByText(`毎日 · 次回：${add(today, 2)}`, { exact: true }),
  ).toBeVisible()
  // 同じ定義を両者で開いてから編集すると後の保存は下書きを残して拒否。
  for (const page of [a, b])
    await page
      .getByRole('button', { name: `編集：${edited}`, exact: true })
      .click()
  await a.getByLabel('タイトル', { exact: true }).fill('先に保存した繰り返し')
  await b.getByLabel('タイトル', { exact: true }).fill('保持する下書き')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(
    b.getByText('先に保存した繰り返し', { exact: true }),
  ).toBeVisible()
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(b.getByRole('status')).toContainText('別の端末')
  await expect(b.getByLabel('タイトル', { exact: true })).toHaveValue(
    '保持する下書き',
  )
  await b.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await a.screenshot({
    path: join(tmpdir(), 'futari-recurring-mobile.png'),
    fullPage: false,
  })
  await b.screenshot({
    path: join(tmpdir(), 'futari-recurring-desktop.png'),
    fullPage: false,
  })
  await section(b, '履歴')
  await expect(
    b
      .getByRole('listitem')
      .filter({ hasText: '毎日の片付け' })
      .getByText('完了を記録：自分', { exact: false }),
  ).toHaveCount(3)
  await b.reload()
  await expect(
    b.getByRole('heading', { name: '家事', exact: true }),
  ).toBeVisible()
  await section(b, '繰り返し')
  await expect(
    b.getByText('先に保存した繰り返し', { exact: true }),
  ).toBeVisible()
  // 113定義/101履歴をEmulatorで用意し、全体取得に依存しないホームと追加表示を確認。
  const env = await initializeTestEnvironment({
    projectId: project,
    firestore: { host: '127.0.0.1', port: 8080 },
  })
  try {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore(),
        houses = await getDocs(
          query(
            collection(d, 'households'),
            where('name', '==', `繰り返し検証${stamp}`),
          ),
        ),
        house = houses.docs[0],
        uid = house.data().ownerId,
        batch = writeBatch(d)
      for (let i = 0; i < 113; i++)
        batch.set(
          doc(d, 'households', house.id, 'recurringTasks', `fixture-${i}`),
          {
            title: `追加表示の家事${i}`,
            assigneeIds: [],
            priority: 'medium',
            frequency: 'daily',
            startDate: today,
            nextDueDate: today,
            active: i < 12,
            version: 1,
            lastCompletionId: null,
            lastAction: 'create',
            createdAt: Timestamp.now(),
            createdBy: uid,
            updatedAt: Timestamp.now(),
            updatedBy: uid,
          },
        )
      for (let i = 0; i < 101; i++)
        batch.set(
          doc(
            d,
            'households',
            house.id,
            'recurringCompletions',
            `fixture-${i}`,
          ),
          {
            scheduleId: 'fixture-0',
            scheduleVersion: i + 1,
            title: `追加表示の履歴${i}`,
            assigneeIds: [],
            priority: 'medium',
            frequency: 'daily',
            startDate: today,
            scheduledDate: today,
            nextDueDate: tomorrow,
            completedAt: Timestamp.fromMillis(i + 1),
            completedBy: uid,
            cancelledAt: null,
            cancelledBy: null,
          },
        )
      await batch.commit()
    })
  } finally {
    await env.cleanup()
  }
  await nav(b, 'ホーム')
  await expect(
    b.getByRole('button', { name: 'さらに10件表示', exact: true }),
  ).toBeVisible()
  await b.getByRole('button', { name: 'さらに10件表示', exact: true }).click()
  await expect(
    b.locator('li').filter({ hasText: '追加表示の家事' }),
  ).toHaveCount(12)
  await nav(b, '家事')
  await section(b, '繰り返し')
  await expect(
    b.locator('li').filter({ hasText: '追加表示の家事' }),
  ).toHaveCount(100)
  await b.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(
    b.locator('li').filter({ hasText: '追加表示の家事' }),
  ).toHaveCount(113)
  await section(b, '履歴')
  await b.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(b.getByText('追加表示の履歴0', { exact: true })).toBeVisible()
  for (const width of [320, 390]) {
    await a.setViewportSize({ width, height: 844 })
    assert(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await a.locator('footer').scrollIntoViewIfNeeded()
    const f = await a.locator('footer').boundingBox(),
      n = await a.getByRole('navigation').boundingBox()
    assert(f.y + f.height <= n.y)
  }
  // Cleaning pagination must apply place on the server before taking the finite window.
  const cleanEnv = await initializeTestEnvironment({
    projectId: project,
    firestore: { host: '127.0.0.1', port: 8080 },
  })
  try {
    let hid, owner
    await cleanEnv.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore(),
        homes = await getDocs(
          query(
            collection(d, 'households'),
            where('name', '==', `繰り返し検証${stamp}`),
          ),
        )
      hid = homes.docs[0].id
      owner = homes.docs[0].data().ownerId
      const batch = writeBatch(d)
      for (let i = 0; i < 103; i++)
        batch.set(
          doc(d, 'households', hid, 'recurringTasks', `clean-page-${i}`),
          {
            title: `掃除追加表示${i}`,
            assigneeIds: [],
            priority: 'medium',
            frequency: 'daily',
            startDate: today,
            nextDueDate: today,
            active: true,
            version: 1,
            lastCompletionId: null,
            lastAction: 'create',
            createdAt: Timestamp.now(),
            createdBy: owner,
            updatedAt: Timestamp.now(),
            updatedBy: owner,
            taskType: 'cleaning',
            place: '追加絞り込み',
            rotation: 'fixed',
          },
        )
      await batch.commit()
    })
    await section(b, '掃除')
    await b.getByLabel('場所で絞り込み').fill('追加絞り込み')
    await b.getByRole('button', { name: '適用', exact: true }).click()
    await expect(
      b.locator('li').filter({ hasText: '掃除追加表示' }),
    ).toHaveCount(100)
    await b
      .getByRole('button', { name: 'さらに100件表示', exact: true })
      .click()
    await expect(
      b.locator('li').filter({ hasText: '掃除追加表示' }),
    ).toHaveCount(103)
    await expect(
      b.getByRole('button', { name: 'さらに100件表示', exact: true }),
    ).toHaveCount(0)
    await b.setViewportSize({ width: 390, height: 844 })
    await b.getByRole('listitem').first().scrollIntoViewIfNeeded()
    await b.screenshot({
      path: join(tmpdir(), 'futari-cleaning-list-mobile.png'),
      fullPage: false,
    })
    await b.getByRole('button', { name: '今週', exact: true }).click()
    const forecast = b.getByText('掃除追加表示0 · 予定', { exact: true })
    if (new Date(today + 'T00:00:00Z').getUTCDay() !== 0) {
      await expect(forecast.first()).toBeVisible()
    }
    await b.screenshot({
      path: join(tmpdir(), 'futari-cleaning-week-mobile.png'),
      fullPage: false,
    })
    await cleanEnv.withSecurityRulesDisabled(async (c) => {
      const batch = writeBatch(c.firestore())
      for (let i = 0; i < 103; i++)
        batch.update(
          doc(
            c.firestore(),
            'households',
            hid,
            'recurringTasks',
            `clean-page-${i}`,
          ),
          { active: false, nextDueDate: '2096-01-01' },
        )
      await batch.commit()
    })
  } finally {
    await cleanEnv.cleanup()
  }
  console.log(
    'PASS: cleaning 103 definitions, server place filter before 100/200 limits, weekly reference projection, no total-count claims',
  )
  await nav(b, '設定')
  await b.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(
    b.getByRole('button', { name: 'ログインする', exact: true }),
  ).toBeVisible()
  await expect(
    b.getByText('先に保存した繰り返し', { exact: true }),
  ).toHaveCount(0)
  await b.getByLabel('メールアドレス', { exact: true }).fill(email)
  await b.getByLabel('パスワード', { exact: true }).fill(password)
  await b.getByRole('button', { name: 'ログインする', exact: true }).click()
  await expect(
    b.getByRole('heading', { name: 'ホーム', exact: true }),
  ).toBeVisible()
  await nav(b, '家事')
  await section(b, '繰り返し')
  await b.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(
    b.getByText('先に保存した繰り返し', { exact: true }),
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
    'PASS: recurring create/share, calendar advancement, history, undo/recomplete, edit invalidates undo, pause/resume, conflict preservation, finite lists/home/history, reload/logout/login, 320/390/1280 layout; no runtime errors',
  )
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
