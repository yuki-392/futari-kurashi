// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'
vi.mock('../lib/firebase/config', () => ({
  firebaseConfig: { status: 'missing' },
}))
vi.mock('../components/PwaUpdateNotice', () => ({
  PwaUpdateNotice: () => null,
}))
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})
it('公開用フッターはビルド識別子を残し開発中を表示しない', () => {
  vi.stubEnv('VITE_APP_BUILD_LABEL', 'release-test')
  const view = render(<App />)
  const footer = view.container.querySelector('footer')!
  expect(footer.textContent).toContain('ふたりの暮らし')
  expect(footer.textContent).toContain(import.meta.env.VITE_APP_BUILD_LABEL)
  expect(footer.textContent).not.toContain('開発中')
  expect(screen.getByText('Firebaseの設定待ち')).toBeTruthy()
})
