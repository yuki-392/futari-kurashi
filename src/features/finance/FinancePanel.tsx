import { useMemo, useState } from 'react'
import { useHousehold } from '../household/context'
import { useOnline } from '../tasks/useTasks'
import { useTokyoDay } from '../tasks/useTokyoDay'
import { FinanceForm } from './FinanceForm'
import {
  changeFinanceCategory,
  changeFinanceEntry,
  createFinanceCategory,
  createFinanceEntry,
  removeFinanceEntry,
} from './service'
import { financeMessage, formatYen, monthTotals } from './model'
import type { FinanceCategory, FinanceEntry, FinanceType } from './model'
import { useFinanceCategories, useFinanceEntries } from './useFinance'

type View = 'entries' | 'categories'

export function FinancePanel() {
  const { uid, household } = useHousehold()
  const today = useTokyoDay()
  const online = useOnline()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [view, setView] = useState<View>('entries')
  const [editing, setEditing] = useState<FinanceEntry | null>(null)
  const categories = useFinanceCategories()
  const entries = useFinanceEntries(month, view === 'entries')
  const totals = useMemo(() => monthTotals(entries.entries), [entries.entries])
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState<FinanceEntry | null>(null)
  const [categoryType, setCategoryType] = useState<FinanceType>('expense')
  const [categoryName, setCategoryName] = useState('')
  const [categoryBusy, setCategoryBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const moveMonth = (amount: number) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const next = new Date(Date.UTC(year!, monthNumber! - 1 + amount, 1))
    setMonth(
      `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`,
    )
    setEditing(null)
    setDeleting(null)
  }

  if (categories.status === 'loading')
    return <p role="status">家計カテゴリを準備しています…</p>
  if (categories.status === 'error')
    return <StateError label="カテゴリ" retry={categories.retry} />

  const categoryLabel = (entry: FinanceEntry) =>
    categories.categories.find((category) => category.id === entry.categoryId)
      ?.name ?? '不明なカテゴリ'

  async function saveEntry(
    entry: FinanceEntry | null,
    input: Parameters<typeof createFinanceEntry>[2],
  ) {
    if (!online) throw Object.assign(new Error(), { code: 'offline' })
    if (entry)
      await changeFinanceEntry(
        household!.id,
        uid,
        entry,
        input,
        categories.categories,
      )
    else
      await createFinanceEntry(household!.id, uid, input, categories.categories)
    setEditing(null)
    setMessage(entry ? '明細を更新しました。' : '')
  }

  async function saveCategory() {
    if (categoryBusy) return
    if (!online) {
      setMessage(
        financeMessage(Object.assign(new Error(), { code: 'offline' })),
      )
      return
    }
    setCategoryBusy(true)
    setMessage('')
    try {
      await createFinanceCategory(
        household!.id,
        uid,
        categoryType,
        categoryName,
      )
      setCategoryName('')
      setMessage('カテゴリを追加しました。')
    } catch (error) {
      setMessage(financeMessage(error))
    } finally {
      setCategoryBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {!online ? (
        <p className="rounded-xl bg-sage p-4 text-sm">
          オフラインです。通信を戻してから操作してください。
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-xl bg-sage p-4 text-sm">
          {message}
        </p>
      ) : null}
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="家計の表示"
      >
        <button
          role="tab"
          aria-selected={view === 'entries'}
          className={
            view === 'entries'
              ? 'task-primary'
              : 'rounded-xl border border-line px-4 py-3'
          }
          onClick={() => {
            setView('entries')
            setEditing(null)
          }}
        >
          月別明細
        </button>
        <button
          role="tab"
          aria-selected={view === 'categories'}
          className={
            view === 'categories'
              ? 'task-primary'
              : 'rounded-xl border border-line px-4 py-3'
          }
          onClick={() => {
            setView('categories')
            setEditing(null)
          }}
        >
          カテゴリ管理
        </button>
      </div>
      {view === 'entries' ? (
        <>
          <section aria-label="月別の収支">
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                className="min-h-11 rounded-xl border border-line px-3"
                aria-label="前の月"
                onClick={() => moveMonth(-1)}
              >
                前月
              </button>
              <h2 className="text-lg font-bold">
                {month.replace('-', '年')}月
              </h2>
              <button
                className="min-h-11 rounded-xl border border-line px-3"
                aria-label="次の月"
                onClick={() => moveMonth(1)}
              >
                翌月
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <p className="rounded-2xl bg-white p-4">
                収入合計{' '}
                <strong className="mt-2 block text-lg">
                  {entries.status === 'ready' ? formatYen(totals.income) : '—'}
                </strong>
              </p>
              <p className="rounded-2xl bg-white p-4">
                支出合計{' '}
                <strong className="mt-2 block text-lg">
                  {entries.status === 'ready' ? formatYen(totals.expense) : '—'}
                </strong>
              </p>
            </div>
          </section>
          {editing ? (
            <FinanceForm
              key={`${editing.id}:${editing.version}`}
              entry={editing}
              categories={categories.categories}
              onCancel={() => setEditing(null)}
              onSave={(input) => saveEntry(editing, input)}
            />
          ) : (
            <FinanceForm
              key="new-entry"
              categories={categories.categories}
              onSave={(input) => saveEntry(null, input)}
            />
          )}
          <section aria-label="月別明細">
            <h2 className="mb-3 font-bold">
              {month.replace('-', '年')}月の明細
            </h2>
            {entries.status === 'loading' ? (
              <p role="status">明細を読み込み中です…</p>
            ) : entries.status === 'error' ? (
              <StateError label="明細" retry={entries.retry} />
            ) : entries.entries.length ? (
              <ul className="space-y-3">
                {entries.entries.map((entry) => (
                  <li
                    key={`${entry.type}:${entry.id}`}
                    className="rounded-2xl border border-line bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">
                          {entry.title}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {entry.date} · {categoryLabel(entry)} ·{' '}
                          {entry.type === 'income' ? '収入' : '支出'}
                        </p>
                        {entry.memo ? (
                          <p className="mt-2 break-words text-sm">
                            {entry.memo}
                          </p>
                        ) : null}
                      </div>
                      <strong className="shrink-0">
                        {formatYen(entry.amount)}
                      </strong>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="rounded-xl border border-line px-3 py-2"
                        onClick={() => {
                          setEditing(entry)
                          setMessage('')
                          window.scrollTo(0, 0)
                        }}
                      >
                        編集
                      </button>
                      <button
                        className="rounded-xl border border-line px-3 py-2"
                        onClick={() => setDeleting(entry)}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-white p-5 text-sm">
                この月の明細はありません。
              </p>
            )}
            {entries.entries.length >= 10000 ? (
              <p role="status" className="mt-3 text-sm text-muted">
                この月の明細は表示上限に達しました。合計は取得した10,000件までを対象にしています。
              </p>
            ) : null}
          </section>
          {deleting ? (
            <section
              className="rounded-2xl border border-line bg-sage p-5"
              role="group"
              aria-label="削除の確認"
            >
              <p>
                「{deleting.title}」を削除しますか？削除後は復元できません。
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  className="task-primary"
                  disabled={!online || deleteBusy}
                  onClick={() => {
                    if (deleteBusy) return
                    setDeleteBusy(true)
                    void removeFinanceEntry(household!.id, deleting)
                      .then(() => {
                        setDeleting(null)
                        setMessage('明細を削除しました。')
                      })
                      .catch((error) => setMessage(financeMessage(error)))
                      .finally(() => setDeleteBusy(false))
                  }}
                >
                  {deleteBusy ? '削除中…' : '削除する'}
                </button>
                <button
                  className="rounded-xl border border-line px-4 py-3"
                  disabled={deleteBusy}
                  onClick={() => setDeleting(null)}
                >
                  キャンセル
                </button>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="space-y-5" aria-label="カテゴリ管理">
          <form
            className="rounded-2xl border border-line bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault()
              void saveCategory()
            }}
          >
            <h2 className="mb-3 font-bold">カテゴリを追加</h2>
            <label className="block text-sm">
              種別
              <select
                className="task-input"
                value={categoryType}
                onChange={(event) =>
                  setCategoryType(event.target.value as FinanceType)
                }
              >
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </label>
            <label className="mt-3 block text-sm">
              カテゴリ名
              <input
                className="task-input"
                maxLength={40}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
              />
            </label>
            <button className="task-primary mt-3" disabled={categoryBusy}>
              {categoryBusy ? '追加中…' : '追加する'}
            </button>
          </form>
          {(['income', 'expense'] as const).map((type) => (
            <CategoryGroup
              key={type}
              type={type}
              uid={uid}
              householdId={household!.id}
              categories={categories.categories.filter(
                (item) => item.type === type,
              )}
              online={online}
              onMessage={setMessage}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function CategoryGroup({
  type,
  uid,
  householdId,
  categories,
  online,
  onMessage,
}: {
  type: FinanceType
  uid: string
  householdId: string
  categories: FinanceCategory[]
  online: boolean
  onMessage: (message: string) => void
}) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  return (
    <section aria-label={type === 'income' ? '収入カテゴリ' : '支出カテゴリ'}>
      <h2 className="mb-3 font-bold">
        {type === 'income' ? '収入カテゴリ' : '支出カテゴリ'}
      </h2>
      <ul className="space-y-2">
        {categories.map((category) => (
          <li
            key={category.id}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3"
          >
            {category.archived ? (
              <span className="min-w-0 flex-1 break-words">
                {category.name}（アーカイブ）
              </span>
            ) : (
              <input
                aria-label={`${category.name}のカテゴリ名`}
                className="task-input min-w-[10rem] flex-1"
                maxLength={40}
                value={names[category.id] ?? category.name}
                onChange={(event) =>
                  setNames((current) => ({
                    ...current,
                    [category.id]: event.target.value,
                  }))
                }
              />
            )}
            {!category.archived ? (
              <button
                className="rounded-xl border border-line px-3 py-2"
                disabled={!online || busy === category.id}
                onClick={() => {
                  setBusy(category.id)
                  void changeFinanceCategory(householdId, uid, category, {
                    name: names[category.id] ?? category.name,
                  })
                    .then(() => {
                      setNames((current) => {
                        const next = { ...current }
                        delete next[category.id]
                        return next
                      })
                      onMessage('カテゴリ名を変更しました。')
                    })
                    .catch((error) => onMessage(financeMessage(error)))
                    .finally(() => setBusy(null))
                }}
              >
                名称変更
              </button>
            ) : null}
            {!category.archived ? (
              <button
                className="rounded-xl border border-line px-3 py-2"
                disabled={!online || busy === category.id}
                onClick={() => {
                  setBusy(category.id)
                  void changeFinanceCategory(householdId, uid, category, {
                    archived: true,
                  })
                    .then(() => onMessage('カテゴリをアーカイブしました。'))
                    .catch((error) => onMessage(financeMessage(error)))
                    .finally(() => setBusy(null))
                }}
              >
                アーカイブ
              </button>
            ) : (
              <button
                className="rounded-xl border border-line px-3 py-2"
                disabled={!online || busy === category.id}
                onClick={() => {
                  setBusy(category.id)
                  void changeFinanceCategory(householdId, uid, category, {
                    archived: false,
                  })
                    .then(() => onMessage('カテゴリを再開しました。'))
                    .catch((error) => onMessage(financeMessage(error)))
                    .finally(() => setBusy(null))
                }}
              >
                再開
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function StateError({ label, retry }: { label: string; retry: () => void }) {
  return (
    <div>
      <p role="status">
        {label}を取得できませんでした。通信を確認してください。
      </p>
      <button className="task-primary mt-3" onClick={retry}>
        再試行
      </button>
    </div>
  )
}
