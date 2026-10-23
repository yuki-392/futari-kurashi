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
  const email = `rules-partner-${stamp}@example.test`
  await account(a, `rules-owner-${stamp}@example.test`)
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
  await Promise.all([nav(a, '設定'), nav(b, '設定')])
  await Promise.all([
    a.getByRole('tab', { name: '家のルール', exact: true }).click(),
    b.getByRole('tab', { name: '家のルール', exact: true }).click(),
  ])
  await expect(a.getByLabel('ルールのカテゴリ', { exact: true })).toContainText(
    '家事',
  )
  await expect(b.getByLabel('ルールのカテゴリ', { exact: true })).toContainText(
    '家事',
  )

  const today = new Date().toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Tokyo',
  })
  const row = (page) =>
    page.getByRole('article', { name: '共有ルール', exact: true })
  async function agreeBoth() {
    await Promise.all([
      row(a).getByRole('button', { name: 'この内容に合意する' }).click(),
      row(b).getByRole('button', { name: 'この内容に合意する' }).click(),
    ])
    await expect(row(a)).toContainText('2人とも合意済み')
    await expect(row(b)).toContainText('2人とも合意済み')
  }
  await a.getByLabel('ルールのタイトル').fill('共有ルール')
  await a.getByLabel('ルールの内容').fill('共有スペースを片付ける')
  await a.getByLabel('ルールのカテゴリ', { exact: true }).selectOption('chores')
  await a.getByLabel('見直し日（任意）').fill(today)
  await a.getByRole('button', { name: '登録する', exact: true }).click()
  await expect(row(b)).toContainText('共有スペースを片付ける')
  await expect(row(a)).toContainText('自分：未合意 · 相手：未合意')
  await expect(row(b)).toContainText('見直し時期')
  await agreeBoth()
  await row(a).getByRole('button', { name: '自分の合意を取り消す' }).click()
  await expect(row(b)).toContainText('自分：合意済み · 相手：未合意')
  await row(a).getByRole('button', { name: '編集', exact: true }).click()
  await a.getByLabel('ルールの内容').fill('編集中の入力を保持')
  await row(b).getByRole('button', { name: '編集', exact: true }).click()
  await b.getByLabel('ルールの内容').fill('内容を変更した約束')
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(row(a)).toContainText('内容を変更した約束')
  await expect(row(b)).toContainText('自分：未合意 · 相手：未合意')
  await a.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(a.getByText(/別の端末で変更されました/)).toBeVisible()
  await expect(a.getByLabel('ルールの内容')).toHaveValue('編集中の入力を保持')
  await a.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await agreeBoth()
  await a.getByRole('tab', { name: 'カテゴリ管理', exact: true }).click()
  const cat = a.getByRole('article', { name: '家事', exact: true })
  await cat.getByRole('button', { name: '削除', exact: true }).click()
  await a.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await cat.getByRole('button', { name: '削除', exact: true }).click()
  await a.getByRole('button', { name: 'アーカイブする', exact: true }).click()
  await expect(row(b)).toContainText('2人とも合意済み')
  await expect(row(b)).toContainText('家事')
  await expect(
    b
      .getByLabel('ルールのカテゴリ', { exact: true })
      .locator('option[value="chores"]'),
  ).toHaveCount(0)
  await a.getByLabel('追加するカテゴリ名').fill('暮らしの計画')
  await a
    .getByRole('button', { name: 'カテゴリを追加する', exact: true })
    .click()
  await expect(b.getByLabel('ルールのカテゴリ', { exact: true })).toContainText(
    '暮らしの計画',
  )
  await cat.getByRole('button', { name: '再利用', exact: true }).click()
  await expect(
    b
      .getByLabel('ルールのカテゴリ', { exact: true })
      .locator('option[value="chores"]'),
  ).toHaveCount(1)
  await a.getByRole('tab', { name: 'ルール一覧', exact: true }).click()
  // Even review-date-only edits require fresh agreement.
  await row(b).getByRole('button', { name: '編集', exact: true }).click()
  await b.getByLabel('見直し日（任意）').fill('')
  await b.getByRole('button', { name: '保存する', exact: true }).click()
  await expect(row(a)).toContainText('自分：未合意 · 相手：未合意')
  await expect(row(a)).toContainText('見直し日：未設定')
  await row(a).getByRole('button', { name: '廃止', exact: true }).click()
  await a.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(row(b)).toBeVisible()
  await row(a).getByRole('button', { name: '廃止', exact: true }).click()
  await a.getByRole('button', { name: '廃止を確定する', exact: true }).click()
  await expect(row(b)).toHaveCount(0)
  await Promise.all([
    a.getByLabel('状態', { exact: true }).selectOption('retired'),
    b.getByLabel('状態', { exact: true }).selectOption('retired'),
  ])
  await expect(row(b)).toBeVisible()
  await expect(
    row(b).getByRole('button', { name: 'この内容に合意する' }),
  ).toHaveCount(0)
  await row(a).getByRole('button', { name: '履歴', exact: true }).click()
  await expect(
    a.getByRole('heading', { name: /廃止 · 操作の版/ }),
  ).toBeVisible()
  await expect(
    a.getByRole('heading', { name: '追加 · 操作の版 1', exact: true }),
  ).toBeVisible()
  await b
    .getByRole('article', { name: '共有ルール', exact: true })
    .getByRole('button', { name: '内容を確認して再開' })
    .click()
  await b.getByRole('button', { name: '再開する', exact: true }).click()
  await expect(
    a.getByRole('heading', { name: /再開 · 操作の版/ }),
  ).toBeVisible()
  await a.getByRole('button', { name: '一覧へ戻る' }).click()
  await Promise.all([
    a.getByLabel('状態', { exact: true }).selectOption('current'),
    b.getByLabel('状態', { exact: true }).selectOption('current'),
  ])
  await expect(row(a)).toContainText('自分：未合意 · 相手：未合意')
  await expect(row(a)).toContainText('内容を変更した約束')
  // Emulator-only fixture preparation. Never use this bypass against a cloud project.
  const ownerUid = await a.evaluate(async () => {
    const { getFirebaseAuth } = await import('/src/lib/firebase/client.ts')
    return (await getFirebaseAuth()).currentUser.uid
  })
  const endpoint = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`
  const profile = await fetch(`${endpoint}/users/${ownerUid}`, {
    headers: { Authorization: 'Bearer owner' },
  })
  const hid = (await profile.json()).fields.householdId.stringValue
  const name = (path) =>
    `projects/${project}/databases/(default)/documents/households/${hid}/${path}`
  const typed = (value) =>
    value === null
      ? { nullValue: null }
      : Array.isArray(value)
        ? { arrayValue: { values: value.map(typed) } }
        : typeof value === 'object'
          ? {
              mapValue: {
                fields: Object.fromEntries(
                  Object.entries(value).map(([k, v]) => [k, typed(v)]),
                ),
              },
            }
          : typeof value === 'boolean'
            ? { booleanValue: value }
            : typeof value === 'number'
              ? { integerValue: String(value) }
              : { stringValue: value }
  const dataFields = (data) => ({
    ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typed(v)])),
    createdAt: { timestampValue: '2026-01-01T00:00:00Z' },
    updatedAt: { timestampValue: '2026-01-01T00:00:00Z' },
  })
  const writes = []
  const seedCategory = (id, categoryName) =>
    writes.push({
      update: {
        name: name(`ruleCategories/${id}`),
        fields: dataFields({
          name: categoryName,
          standard: false,
          archived: false,
          version: 1,
          createdBy: ownerUid,
          updatedBy: ownerUid,
        }),
      },
    })
  seedCategory('aaa-pagination', '追加表示検証')
  for (let i = 0; i < 102; i++)
    seedCategory(`cat-${String(i).padStart(3, '0')}`, `追加カテゴリ${i}`)
  function seedRule(id, version = 1, category = 'aaa-pagination') {
    const data = {
      title: id,
      body: '架空の表示件数検証',
      categoryId: category,
      categoryName: category === 'chores' ? '家事' : '追加表示検証',
      reviewDate: null,
      archived: false,
      contentVersion: version,
      version,
      agreedUids: [],
      lastAction: version === 1 ? 'create' : 'edit',
      createdBy: ownerUid,
      updatedBy: ownerUid,
    }
    const fields = dataFields(data)
    writes.push({ update: { name: name(`houseRules/${id}`), fields } })
    writes.push({
      update: {
        name: name(`houseRules/${id}/history/${version}`),
        fields: { snapshot: { mapValue: { fields } } },
      },
    })
  }
  for (let i = 0; i < 103; i++) seedRule(`seed-${String(i).padStart(3, '0')}`)
  for (let i = 2; i <= 103; i++) {
    const data = {
      title: 'seed-000',
      body: '架空の表示件数検証',
      categoryId: 'aaa-pagination',
      categoryName: '追加表示検証',
      reviewDate: null,
      archived: false,
      contentVersion: i,
      version: i,
      agreedUids: [],
      lastAction: 'edit',
      createdBy: ownerUid,
      updatedBy: ownerUid,
    }
    const fields = dataFields(data)
    writes.push({
      update: {
        name: name(`houseRules/seed-000/history/${i}`),
        fields: { snapshot: { mapValue: { fields } } },
      },
    })
    if (i === 103)
      writes.push({ update: { name: name('houseRules/seed-000'), fields } })
  }
  const seed = await fetch(`${endpoint}:commit`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer owner',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  })
  assert.equal(seed.status, 200, await seed.text())
  await expect(
    a.getByRole('button', { name: 'カテゴリをさらに100件表示' }),
  ).toBeVisible()
  await a.getByRole('button', { name: 'カテゴリをさらに100件表示' }).click()
  await a
    .getByLabel('カテゴリで絞り込み', { exact: true })
    .selectOption('aaa-pagination')
  await expect(a.getByRole('article')).toHaveCount(100)
  await a.getByRole('button', { name: 'さらに100件表示', exact: true }).click()
  await expect(a.getByRole('article')).toHaveCount(103)
  await a
    .getByRole('article', { name: 'seed-000', exact: true })
    .getByRole('button', { name: '履歴' })
    .click()
  await expect(a.getByRole('article')).toHaveCount(100)
  await a
    .getByRole('button', { name: '履歴をさらに100件表示', exact: true })
    .click()
  await expect(a.getByRole('article')).toHaveCount(103)
  await expect(
    a.getByRole('heading', { name: '追加 · 操作の版 1', exact: true }),
  ).toBeVisible()
  await a.getByRole('button', { name: '一覧へ戻る' }).click()
  await a
    .getByLabel('カテゴリで絞り込み', { exact: true })
    .selectOption('money')
  await expect(a.getByText('この条件のルールはありません。')).toBeVisible()
  await a.reload()
  await nav(a, '設定')
  await a.getByRole('tab', { name: '家のルール', exact: true }).click()
  await expect(row(a)).toBeVisible()
  for (const width of [320, 390, 1280]) {
    await a.setViewportSize({ width, height: 844 })
    assert.ok(
      await a.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `house rule layout at ${width}`,
    )
  }
  await a.setViewportSize({ width: 390, height: 844 })
  await a.screenshot({
    path: '/tmp/futari-house-rules-mobile.png',
    fullPage: false,
  })
  await b.screenshot({
    path: '/tmp/futari-house-rules-desktop.png',
    fullPage: false,
  })
  await expect(a.locator('vite-error-overlay')).toHaveCount(0)
  assert.match(await a.title(), /^ふたりの暮らし/)
  await a.getByRole('tab', { name: '世帯・アカウント', exact: true }).click()
  await a.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(a.getByText('共有ルール', { exact: true })).toHaveCount(0)
  await expect(row(b)).toBeVisible()
  await a
    .getByLabel('メールアドレス', { exact: true })
    .fill(`rules-owner-${stamp}@example.test`)
  await a.getByLabel('パスワード', { exact: true }).fill(password)
  await a.getByRole('button', { name: 'ログインする', exact: true }).click()
  await nav(a, '設定')
  await a.getByRole('tab', { name: '家のルール', exact: true }).click()
  await expect(row(a)).toBeVisible()
  assert.deepEqual(errors, [])
  console.log(
    'House rules browser passed: create/share, simultaneous agreement, withdrawal, stale edit/input, setting-only reset, category archive/reuse, history/retire/restore, reload/logout/login and mobile layout',
  )
  await first.close()
  await second.close()
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
