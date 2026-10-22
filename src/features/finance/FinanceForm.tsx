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
}: {
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
  const [title, setTitle] = useState(entry?.title ?? '')
  const [amount, setAmount] = useState(entry?.amount.toString() ?? '')
  const [date, setDate] = useState(entry?.date ?? today)
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    entry?.categoryId ?? '',
  )
  const categoryId = available.some((item) => item.id === selectedCategoryId)
    ? selectedCategoryId
    : (available[0]?.id ?? '')
  const [memo, setMemo] = useState(entry?.memo ?? '')
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
        if (lock.current) return
        const parsedAmount = Number(amount)
        if (!Number.isSafeInteger(parsedAmount)) {
          setMessage('金額は1〜999999999円の整数で入力してください。')
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
      <fieldset disabled={busy} className="space-y-4">
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
        <div className="grid grid-cols-2 gap-3">
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
            className="task-input"
            value={categoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
          >
            {available.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.archived ? '（アーカイブ）' : ''}
              </option>
            ))}
          </select>
        </label>
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
          <button className="task-primary" disabled={busy || !available.length}>
            {busy ? '保存中…' : entry ? '保存する' : '登録する'}
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
