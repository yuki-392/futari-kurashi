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
  const householdName = 'ふたりのテスト世帯'.repeat(4) + 'の暮らし'
  assert.equal(Array.from(householdName).length, 40)
  await owner.getByLabel('世帯名', { exact: true }).fill(householdName)
  await owner.getByRole('button', { name: '世帯を作る', exact: true }).click()
  await expect(owner.getByText('参加人数：1 / 2人')).toBeVisible()
  await expect(
    owner.getByRole('heading', { name: 'ホーム', exact: true }),
  ).toBeVisible()
  await owner
    .getByRole('navigation')
    .getByRole('link', { name: '設定', exact: true })
    .click()
  await owner.setViewportSize({ width: 390, height: 420 })
  await owner.getByLabel('相手のメールアドレス').fill(email)
  await expect(owner.getByLabel('相手のメールアドレス')).toBeInViewport()
  assert(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await owner.setViewportSize({ width: 390, height: 844 })
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
    partner.getByText(`${householdName}に参加しますか？`),
  ).toBeVisible()
  await owner
    .getByRole('navigation')
    .getByRole('link', { name: 'ホーム', exact: true })
    .click()
  await expect(owner.getByText('参加人数：1 / 2人')).toBeVisible()
  await partner.getByRole('button', { name: '参加する', exact: true }).click()
  for (const page of [owner, partner]) {
    await expect(page.getByText('参加人数：2 / 2人')).toBeVisible()
    await expect(
      page.getByText('自分：参加済み · パートナー：参加済み'),
    ).toBeVisible()
    await page.reload()
    await expect(page.getByText('参加人数：2 / 2人')).toBeVisible()
  }
  const nav = partner.getByRole('navigation', { name: '主要メニュー' })
  for (const [label, id] of [
    ['家事', 'chores'],
    ['買い物', 'shopping'],
    ['片付け', 'declutter'],
    ['家計', 'finances'],
    ['設定', 'settings'],
    ['ホーム', 'home'],
  ]) {
    await nav.getByRole('link', { name: label, exact: true }).click()
    await expect(
      partner.getByRole('heading', { name: label, exact: true }),
    ).toBeFocused()
    await expect(partner).toHaveURL(`${url}#/${id}`)
    await expect(
      nav.getByRole('link', { name: label, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  }
  await partner.goto(`${url}#/shopping`)
  await expect(
    partner.getByRole('heading', { name: '買い物', exact: true }),
  ).toBeVisible()
  await partner.reload()
  await expect(
    partner.getByRole('heading', { name: '買い物', exact: true }),
  ).toBeVisible()
  await nav.getByRole('link', { name: '家事', exact: true }).click()
  await partner.goBack()
  await expect(
    partner.getByRole('heading', { name: '買い物', exact: true }),
  ).toBeVisible()
  await partner.goForward()
  await expect(
    partner.getByRole('heading', { name: '家事', exact: true }),
  ).toBeVisible()
  await partner.goto(`${url}#/invalid`)
  await expect(partner).toHaveURL(`${url}#/home`)
  await expect(partner).toHaveTitle(
    'ふたりの暮らし | 家事も、お金も、ふたりで。',
  )
  await expect(partner.locator('vite-error-overlay')).toHaveCount(0)
  for (const width of [320, 390]) {
    await partner.setViewportSize({ width, height: 844 })
    assert(
      await partner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    for (const link of await nav.getByRole('link').all()) {
      const box = await link.boundingBox()
      assert(box.width >= 44 && box.height >= 44)
    }
    await partner.locator('footer').scrollIntoViewIfNeeded()
    const footer = await partner.locator('footer').boundingBox(),
      bottom = await nav.boundingBox()
    assert(footer.y + footer.height <= bottom.y)
  }
  await partner.setViewportSize({ width: 390, height: 844 })
  await partner.evaluate(() => window.scrollTo(0, 0))
  // 更新通知の状態遷移はtest:pwaで確認。この配置用fixtureでナビとの重なりを確認する。
  await partner.evaluate(() => {
    const notice = document.createElement('aside')
    notice.className = 'notice'
    notice.dataset.layoutFixture = 'true'
    notice.textContent = '新しいバージョンを利用できます。'
    document.querySelector('.app-layout').append(notice)
  })
  const noticeBox = await partner.locator('[data-layout-fixture]').boundingBox()
  const navBox = await nav.boundingBox()
  assert(noticeBox.y + noticeBox.height < navBox.y)
  await partner.screenshot({
    path: join(tmpdir(), 'futari-home-update-layout.png'),
    fullPage: false,
  })
  await partner.locator('[data-layout-fixture]').evaluate((el) => el.remove())
  await partner.screenshot({
    path: join(tmpdir(), 'futari-household-mobile.png'),
    fullPage: true,
  })
  await owner.setViewportSize({ width: 1280, height: 900 })
  await owner.screenshot({
    path: join(tmpdir(), 'futari-household-desktop.png'),
    fullPage: true,
  })
  await partner
    .getByRole('navigation')
    .getByRole('link', { name: '設定', exact: true })
    .click()
  await partner.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(
    partner.getByRole('button', { name: 'ログインする' }),
  ).toBeVisible()
  await expect(partner.getByText(householdName, { exact: true })).toHaveCount(0)
  await partner.reload()
  await expect(
    partner.getByRole('button', { name: 'ログインする' }),
  ).toBeVisible()
  // 同じブラウザーで別アカウントへ切り替えても前ユーザーの世帯を表示しない。
  await account(partner, `outsider-${stamp}@example.test`)
  await expect(partner.getByText(householdName, { exact: true })).toHaveCount(0)
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
