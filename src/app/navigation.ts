import { useEffect, useSyncExternalStore } from 'react'

export const pages = [
  { id: 'home', label: 'ホーム', path: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  {
    id: 'chores',
    label: '家事',
    path: 'm4 6 2 2 4-4M13 6h7M4 14l2 2 4-4M13 14h7M13 21h7',
  },
  {
    id: 'shopping',
    label: '買い物',
    path: 'M3 3h2l3 13h11l3-9H6M9 21h.01M18 21h.01',
  },
  {
    id: 'declutter',
    label: '片付け',
    path: 'M3 8h18v13H3ZM2 3h20v5H2ZM9 12h6',
  },
  {
    id: 'finances',
    label: '家計',
    path: 'M4 3h16v18H4ZM8 7h8M8 11h2M14 11h2M8 15h2M14 15h2',
  },
  {
    id: 'settings',
    label: '設定',
    path: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  },
] as const
export type PageId = (typeof pages)[number]['id']
export function resetPage() {
  history.replaceState(null, '', '#/home')
  window.dispatchEvent(new Event('hashchange'))
}
function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener)
  window.addEventListener('popstate', listener)
  return () => {
    window.removeEventListener('hashchange', listener)
    window.removeEventListener('popstate', listener)
  }
}
export function usePage() {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  const page = pages.find((entry) => `#/${entry.id}` === hash) ?? pages[0]
  useEffect(() => {
    if (hash !== `#/${page.id}`) resetPage()
  }, [hash, page.id])
  return page
}
