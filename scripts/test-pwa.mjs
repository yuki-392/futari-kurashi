import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { chromium, expect } from '@playwright/test'

// 実際の本番ビルド2つを同一originで配信し、SWのライフサイクルを検証する。
const temp = await mkdtemp(join(tmpdir(), 'futari-pwa-'))
const screenshots = join(tmpdir(), 'futari-pwa-evidence')
await mkdir(screenshots, { recursive: true })
let root = join(temp, 'a')
let browser
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, 'http://localhost').pathname,
  )
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (!file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end()
    return
  }
  try {
    const contents = await readFile(file)
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'public,max-age=31536000,immutable'
        : 'no-cache',
    })
    response.end(contents)
  } catch {
    response.writeHead(404).end()
  }
})

try {
  for (const label of ['a', 'b']) {
    console.log(`Building pwa-check-${label}`)
    const result = spawnSync(
      process.execPath,
      [
        resolve('node_modules/vite/bin/vite.js'),
        'build',
        '--outDir',
        join(temp, label),
      ],
      {
        env: {
          ...process.env,
          VITE_APP_BUILD_LABEL: `pwa-check-${label}`,
          VITE_FIREBASE_API_KEY: '',
          VITE_FIREBASE_AUTH_DOMAIN: '',
          VITE_FIREBASE_PROJECT_ID: '',
          VITE_FIREBASE_APP_ID: '',
        },
        encoding: 'utf8',
      },
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
  }

  await new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', done)
  })
  const url = `http://127.0.0.1:${server.address().port}/`
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(url)
  assert.equal(page.url(), url)
  await expect(page).toHaveTitle('ふたりの暮らし | 家事も、お金も、ふたりで。')
  await expect(
    page.getByRole('heading', { name: 'ふたりの暮らし', exact: true }),
  ).toBeVisible()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.locator('footer')).toContainText('pwa-check-a')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true)
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const requests = (
      await Promise.all(
        names.map(async (name) => (await caches.open(name)).keys()),
      )
    ).flat()
    return requests.map((request) => request.url)
  })
  assert(cached.some((entry) => entry.includes('/index.html')))
  assert(cached.some((entry) => entry.includes('/assets/')))
  assert(cached.every((entry) => new URL(entry).origin === new URL(url).origin))

  await page
    .getByText('iPhoneでホーム画面に追加するには', { exact: true })
    .click()
  await expect(page.getByText(/HTTPSで公開後、SafariでURLを開き/)).toBeVisible()
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.screenshot({
    path: join(screenshots, 'mobile.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.screenshot({
    path: join(screenshots, 'desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  console.log(
    'PASS: identity, nonblank, no overlay, install instructions, mobile/desktop, SW control, static cache',
  )

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('footer')).toContainText('pwa-check-a')
  await expect(
    page.getByRole('heading', { name: 'ふたりの暮らし', exact: true }),
  ).toBeVisible()
  console.log('PASS: offline reload of cached build A')
  await context.setOffline(false)

  root = join(temp, 'b')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(
    page.getByRole('button', { name: '更新する', exact: true }),
  ).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'あとで', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '更新する', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('footer')).toContainText('pwa-check-a')
  await page.evaluate(() =>
    document.dispatchEvent(new Event('visibilitychange')),
  )
  await expect(
    page.getByRole('button', { name: '更新する', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: join(screenshots, 'update.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: '更新する', exact: true }).click()
  await expect(page.locator('footer')).toContainText('pwa-check-b', {
    timeout: 20_000,
  })
  await expect(
    page.getByRole('button', { name: '更新する', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'ふたりの暮らし', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: join(screenshots, 'updated.png'),
    fullPage: true,
  })
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`)
  console.log(
    'PASS: update found, defer keeps A, foreground re-notifies, user applies B, no runtime/console errors',
  )
  console.log(`Screenshots: ${screenshots}`)
} finally {
  await browser?.close()
  if (server.listening) await new Promise((done) => server.close(done))
  await rm(temp, { recursive: true, force: true })
}
