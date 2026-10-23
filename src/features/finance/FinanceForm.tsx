import { splitExpense } from './settlementModel'
import { formatYen } from './model'
import { useEffect, useRef, useState } from 'react'
import { financeMessage } from './model'
import type {
  FinanceCategory,
  FinanceEntry,
  FinanceEntryInput,
  FinanceType,
} from './model'
import { useTokyoDay } from '../tasks/useTokyoDay'

export function FinanceForm({
  categories,
  entry,
  onSave,
  onCancel,
  members = [],
  uid = '',
  defaults,
  expenseOnly = false,
  disabled = false,
  submitLabel,
}: {
  defaults?: Partial<FinanceEntryInput>
  expenseOnly?: boolean
  disabled?: boolean
  submitLabel?: string
  members?: string[]
  uid?: string
  categories: FinanceCategory[]
  entry?: FinanceEntry
  onSave: (input: FinanceEntryInput) => Promise<void>
  onCancel?: () => void
}) {
  const today = useTokyoDay()
  const [type, setType] = useState<FinanceType>(entry?.type ?? 'expense')
  const available = categories.filter(
    (category) =>
      category.type === type &&
      (!category.archived || category.id === entry?.categoryId),
  )
  const [title, setTitle] = useState(entry?.title ?? defaults?.title ?? '')
  const [amount, setAmount] = useState(entry?.amount.toString() ?? '')
  const [date, setDate] = useState(entry?.date ?? defaults?.date ?? today)
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    entry?.categoryId ?? defaults?.categoryId ?? '',
  )
  const categoryId = available.some((item) => item.id === selectedCategoryId)
    ? selectedCategoryId
    : expenseOnly
      ? ''
      : (available[0]?.id ?? '')
  const [memo, setMemo] = useState(entry?.memo ?? '')
  const partner = members.find((id) => id !== uid) ?? ''
  const [included, setIncluded] = useState(
    entry ? Boolean(entry.sharing) : members.length === 2,
  )
  const [payerId, setPayerId] = useState(entry?.sharing?.payerId ?? uid)
  const [percent, setPercent] = useState(
    String(entry?.sharing?.shares[uid] ?? 50),
  )
  const sharing =
    included && members.length === 2
      ? {
          payerId,
          shares: { [uid]: Number(percent), [partner]: 100 - Number(percent) },
        }
      : null
  const preview =
    sharing &&
    Number.isInteger(Number(percent)) &&
    Number(percent) >= 0 &&
    Number(percent) <= 100
      ? splitExpense(Number(amount), sharing)
      : null
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (message) feedback.current?.focus()
  }, [message])
  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border border-line bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (lock.current || disabled) return
        if (
          type === 'expense' &&
          included &&
          members.length === 2 &&
          (!percent.trim() ||
            !Number.isInteger(Number(percent)) ||
            Number(percent) < 0 ||
            Number(percent) > 100)
        ) {
          setMessage('負担割合は0〜100%の整数で入力してください。')
          return
        }
        const parsedAmount = Number(amount)
        if (
          !Number.isSafeInteger(parsedAmount) ||
          parsedAmount < 1 ||
          parsedAmount > 999999999
        ) {
          setMessage('金額は1〜999999999円の整数で入力してください。')
          return
        }
        if (!categoryId) {
          setMessage('利用できる支出カテゴリを選んでください。')
          return
        }
        lock.current = true
        setBusy(true)
        setMessage('')
        void onSave({
          type,
          title,
          amount: parsedAmount,
          date,
          categoryId,
          memo,
          ...(type === 'expense' ? { sharing } : {}),
        })
          .then(() => {
            if (!entry) {
              setTitle('')
              setAmount('')
              setMemo('')
              setDate(today)
              setMessage('明細を登録しました。')
            }
          })
          .catch((error) => setMessage(financeMessage(error)))
          .finally(() => {
            lock.current = false
            setBusy(false)
          })
      }}
    >
      <h2 className="font-bold">{entry ? '明細を編集' : '明細を追加'}</h2>
      {message ? (
        <p ref={feedback} tabIndex={-1} role="status">
          {message}
        </p>
      ) : null}
      <fieldset disabled={busy || disabled} className="space-y-4">
        {!expenseOnly ? (
          <label className="block text-sm">
            種別
            <select
              aria-label="種別"
              className="task-input"
              value={type}
              disabled={Boolean(entry)}
              onChange={(event) => setType(event.target.value as FinanceType)}
            >
              <option value="expense">支出</option>
              <option value="income">収入</option>
            </select>
          </label>
        ) : (
          <p className="text-sm">種別：支出</p>
        )}
        <label className="block text-sm">
          内容
          <input
            className="task-input"
            autoComplete="off"
            maxLength={100}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div
          className={`grid gap-3 ${expenseOnly ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'}`}
        >
          <label className="block min-w-0 text-sm">
            金額（円）
            <input
              className="task-input"
              inputMode="numeric"
              type="number"
              min="1"
              max="999999999"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="block min-w-0 text-sm">
            日付
            <input
              className="task-input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>
        <label className="block text-sm">
          カテゴリ
          <select
            aria-label="カテゴリ"
            className="task-input"
            value={categoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
          >
            {expenseOnly ? <option value="">選択してください</option> : null}
            {available.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.archived ? '（アーカイブ）' : ''}
              </option>
            ))}
          </select>
        </label>
        {type === 'expense' ? (
          <section
            className="space-y-3 rounded-xl bg-sage p-4"
            aria-label="精算の設定"
          >
            {entry?.sharing === undefined && entry ? (
              <p className="text-sm">
                精算情報未設定・対象外です。登録者から支払者を推測しません。
              </p>
            ) : null}
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={included && members.length === 2}
                disabled={members.length !== 2}
                onChange={(e) => setIncluded(e.target.checked)}
              />
              精算対象にする
            </label>
            {members.length !== 2 ? (
              <p className="text-sm">2人所属後に精算対象を設定できます。</p>
            ) : null}
            {included && members.length === 2 ? (
              <>
                <label className="block">
                  支払者
                  <select
                    aria-label="支払者"
                    className="task-input"
                    value={payerId}
                    onChange={(e) => setPayerId(e.target.value)}
                  >
                    {members.map((id) => (
                      <option key={id} value={id}>
                        {id === uid ? '自分' : '相手'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  自分の負担割合（%）
                  <input
                    className="task-input"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="100"
                    step="1"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                  />
                </label>
                <p>相手の負担割合：{100 - Number(percent)}%</p>
                {preview ? (
                  <p>
                    負担額：自分 {formatYen(preview[uid] ?? 0)} ／ 相手{' '}
                    {formatYen(preview[partner] ?? 0)}
                  </p>
                ) : null}
                <p className="text-sm">1円未満の端数は支払者が負担します。</p>
              </>
            ) : null}
          </section>
        ) : null}
        <label className="block text-sm">
          メモ（任意）
          <textarea
            className="task-input min-h-20"
            maxLength={500}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="task-primary"
            disabled={busy || disabled || !available.length}
          >
            {busy
              ? '保存中…'
              : (submitLabel ?? (entry ? '保存する' : '登録する'))}
          </button>
          {onCancel ? (
            <button
              type="button"
              className="rounded-xl border border-line px-4 py-3"
              disabled={busy}
              onClick={onCancel}
            >
              キャンセル
            </button>
          ) : null}
        </div>
      </fieldset>
    </form>
  )
}
