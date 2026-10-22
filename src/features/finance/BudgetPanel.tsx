import { useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { useOnline } from '../tasks/useTasks'
import type { FinanceCategory, FinanceEntry } from './model'
import { financeMessage, formatYen } from './model'
import { budgetBalance, expenseTotals, parseBudgetAmount } from './budgetModel'
import type { Budget } from './budgetModel'
import { copyPreviousBudgets, removeBudget, saveBudget } from './budgetService'
import { useBudgets } from './useBudgets'

export function BudgetPanel({
  month,
  categories,
  entries,
  complete,
  ready,
  error = false,
  onRetry,
}: {
  month: string
  categories: FinanceCategory[]
  entries: FinanceEntry[]
  complete: boolean
  ready: boolean
  error?: boolean
  onRetry: () => void
}) {
  const { uid, household } = useHousehold(),
    budgets = useBudgets(month),
    online = useOnline()
  const [message, setMessage] = useState(''),
    [copying, setCopying] = useState(false),
    lock = useRef(false)
  const totals = expenseTotals(entries)
  if (budgets.status === 'loading')
    return <p role="status">予算を読み込み中です…</p>
  if (budgets.status === 'error')
    return (
      <p role="alert">
        予算を取得できませんでした。
        <button className="task-primary ml-3" onClick={budgets.retry}>
          再試行
        </button>
      </p>
    )
  if (!budgets.complete)
    return (
      <p role="alert">
        予算が取得上限に達したため、正確な残額を表示できません。
        <button className="task-primary ml-3" onClick={budgets.retry}>
          再試行
        </button>
      </p>
    )
  const ids = new Set([
    ...categories
      .filter((c) => c.type === 'expense' && !c.archived)
      .map((c) => c.id),
    ...budgets.budgets.flatMap((b) => (b.categoryId ? [b.categoryId] : [])),
    ...Object.keys(totals.categories),
  ])
  return (
    <section aria-label="月別予算" className="space-y-4">
      <p className="text-sm text-muted">
        月全体とカテゴリ別は独立した予算です。合計が一致しなくても設定できます。超過しても支出は登録できます。
      </p>
      {!online ? (
        <p role="status">オフラインです。通信を戻してから操作してください。</p>
      ) : null}
      {error ? (
        <p role="alert">
          支出実績を取得できませんでした。
          <button className="task-primary ml-3" onClick={onRetry}>
            再試行
          </button>
        </p>
      ) : !ready ? (
        <p role="status">支出実績を読み込み中です…</p>
      ) : !complete ? (
        <p role="status">
          支出実績が取得上限に達しました。取得範囲の実績だけを表示し、正確な残額は表示しません。
        </p>
      ) : null}
      <button
        className="task-primary"
        disabled={!online || copying || month === '1000-01'}
        onClick={() => {
          if (lock.current) return
          lock.current = true
          setCopying(true)
          setMessage('')
          void copyPreviousBudgets(household!.id, uid, month)
            .then((result) =>
              setMessage(
                result.copied + result.skipped + result.failed === 0
                  ? '前月の予算は未設定です。'
                  : `コピー結果：成功${result.copied}件・スキップ${result.skipped}件・失敗${result.failed}件。${result.failed ? '再度コピーすると未設定だけを再試行します。' : '設定済みの予算は保持しました。'}`,
              ),
            )
            .catch((e) => setMessage(financeMessage(e)))
            .finally(() => {
              lock.current = false
              setCopying(false)
            })
        }}
      >
        {copying ? 'コピー中…' : '前月からコピー'}
      </button>
      <p className="text-sm text-muted">
        設定済みの0円も保持し、前月から未設定部分だけをコピーします。
      </p>
      {message ? <p role="status">{message}</p> : null}
      <BudgetRow
        key={`${month}:total`}
        month={month}
        categoryId={null}
        label="月全体"
        budget={budgets.budgets.find((b) => b.scope === 'total') ?? null}
        expense={totals.total}
        complete={ready && complete && !error}
        ready={ready && !error}
        editable
        blocked={copying || !online}
      />
      <h2 className="text-lg font-bold">支出カテゴリ別の予算</h2>
      {[...ids].map((id) => {
        const category = categories.find((c) => c.id === id)
        return (
          <BudgetRow
            key={`${month}:${id}`}
            month={month}
            categoryId={id}
            label={category?.name ?? `カテゴリ（${id}）`}
            budget={budgets.budgets.find((b) => b.categoryId === id) ?? null}
            expense={totals.categories[id] ?? 0}
            complete={ready && complete && !error}
            ready={ready && !error}
            editable={Boolean(category && !category.archived)}
            archived={category?.archived}
            blocked={copying || !online}
          />
        )
      })}
    </section>
  )
}
function BudgetRow({
  month,
  categoryId,
  label,
  budget,
  expense,
  complete,
  ready,
  editable,
  archived = false,
  blocked,
}: {
  month: string
  categoryId: string | null
  label: string
  budget: Budget | null
  expense: number
  complete: boolean
  ready: boolean
  editable: boolean
  archived?: boolean
  blocked: boolean
}) {
  const { uid, household } = useHousehold()
  const [edit, setEdit] = useState<{
      amount: string
      expected: Budget | null
    } | null>(null),
    [clear, setClear] = useState<Budget | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    lock = useRef(false)
  const region = `${label}の予算`
  return (
    <section
      aria-label={region}
      className="rounded-2xl border border-line bg-white p-5 space-y-3 min-w-0 break-words"
    >
      <h3 className="font-bold">
        {region}
        {archived ? '（アーカイブ）' : ''}
      </h3>
      <p>予算：{budget ? formatYen(budget.amount) : '未設定'}</p>
      <p>
        {complete ? '支出実績' : '取得範囲の支出実績'}：
        {ready ? formatYen(expense) : '確認中'}
      </p>
      {complete ? (
        <p
          className={
            budget !== null && expense > budget.amount
              ? 'font-bold text-red-800'
              : 'font-medium text-forest'
          }
        >
          {budgetBalance(budget?.amount ?? null, expense)}
        </p>
      ) : (
        <p>残額は実績確認後に表示します。</p>
      )}
      {archived ? (
        <p className="text-sm text-muted">
          アーカイブ済みのため新規設定・編集はできません。既存の設定は解除できます。
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {edit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (lock.current || blocked) return
            let amount: number
            try {
              amount = parseBudgetAmount(edit.amount)
            } catch (e) {
              setMessage(financeMessage(e))
              return
            }
            lock.current = true
            setBusy(true)
            setMessage('')
            void saveBudget(
              household!.id,
              uid,
              month,
              categoryId,
              amount,
              edit.expected,
            )
              .then(() => {
                setEdit(null)
                setMessage('予算を保存しました。')
              })
              .catch((e) => setMessage(financeMessage(e)))
              .finally(() => {
                lock.current = false
                setBusy(false)
              })
          }}
        >
          <fieldset disabled={busy || blocked} className="space-y-3">
            <label className="block text-sm">
              {label}の予算額（円）
              <input
                className="task-input"
                inputMode="numeric"
                value={edit.amount}
                onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
              />
            </label>
            <button className="task-primary" disabled={busy || blocked}>
              {busy ? '保存中…' : '保存する'}
            </button>
            <button
              type="button"
              className="min-h-11 px-4"
              onClick={() => {
                setEdit(null)
                setMessage('')
              }}
            >
              キャンセル
            </button>
          </fieldset>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <button
              className="task-primary"
              disabled={blocked || busy}
              onClick={() => {
                setEdit({
                  amount: budget?.amount.toString() ?? '',
                  expected: budget,
                })
                setClear(null)
                setMessage('')
              }}
            >
              {budget ? '予算を編集' : '予算を設定'}
            </button>
          ) : null}
          {budget ? (
            <button
              className="min-h-11 rounded-xl border border-line px-4"
              disabled={blocked || busy}
              onClick={() => {
                setClear(budget)
                setMessage('')
              }}
            >
              設定を解除
            </button>
          ) : null}
        </div>
      )}
      {clear ? (
        <div role="group" aria-label={`${label}の解除確認`}>
          <p>{label}の予算を未設定に戻しますか？支出の明細は保持されます。</p>
          <button
            className="task-primary mt-3"
            disabled={blocked || busy}
            onClick={() => {
              if (lock.current || blocked) return
              lock.current = true
              setBusy(true)
              setMessage('')
              void removeBudget(household!.id, clear)
                .then(() => {
                  setClear(null)
                  setMessage('予算の設定を解除しました。')
                })
                .catch((e) => setMessage(financeMessage(e)))
                .finally(() => {
                  lock.current = false
                  setBusy(false)
                })
            }}
          >
            {busy ? '解除中…' : '解除する'}
          </button>
          <button
            className="min-h-11 px-4"
            disabled={busy}
            onClick={() => setClear(null)}
          >
            キャンセル
          </button>
        </div>
      ) : null}
    </section>
  )
}
