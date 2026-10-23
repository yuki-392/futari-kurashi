import { useEffect, useRef, useState } from 'react'
import { cleanRuleInput, ruleMessage } from './model'
import type { HouseRule, RuleCategory, RuleInput } from './model'
export function RuleForm({
  categories,
  entry,
  restoring = false,
  disabled = false,
  onSave,
  onCancel,
}: {
  categories: Pick<RuleCategory, 'id' | 'name' | 'archived'>[]
  entry?: HouseRule
  restoring?: boolean
  disabled?: boolean
  onSave: (input: RuleInput) => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(entry?.title ?? ''),
    [body, setBody] = useState(entry?.body ?? ''),
    [categoryId, setCategoryId] = useState(entry?.categoryId ?? 'other'),
    [date, setDate] = useState(entry?.reviewDate ?? '')
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    lock = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null),
    editingId = entry?.id
  useEffect(() => {
    if (editingId) heading.current?.focus()
  }, [editingId])
  const available = categories.filter(
    (c) => !c.archived || c.id === entry?.categoryId,
  )
  if (entry && !available.some((c) => c.id === entry.categoryId))
    available.push({
      id: entry.categoryId,
      name: entry.categoryName,
      archived: false,
    })
  const selected = available.some((c) => c.id === categoryId)
    ? categoryId
    : (available[0]?.id ?? '')
  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border border-line bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (lock.current || disabled) return
        let input: RuleInput
        try {
          input = cleanRuleInput({
            title,
            body,
            categoryId: selected,
            reviewDate: date || null,
          })
        } catch (e) {
          setMessage(ruleMessage(e))
          return
        }
        lock.current = true
        setBusy(true)
        setMessage('')
        void onSave(input)
          .then(() => {
            if (!entry) {
              setTitle('')
              setBody('')
              setDate('')
              setMessage('ルールを登録しました。')
            }
          })
          .catch((e) => setMessage(ruleMessage(e)))
          .finally(() => {
            lock.current = false
            setBusy(false)
          })
      }}
    >
      <h3 ref={heading} tabIndex={-1} className="font-bold outline-none">
        {restoring
          ? '内容を確認して再開'
          : entry
            ? 'ルールを編集'
            : 'ルールを追加'}
      </h3>
      {message ? <p role="status">{message}</p> : null}
      <fieldset disabled={busy || disabled} className="space-y-4">
        <label className="block text-sm">
          ルールのタイトル
          <input
            className="task-input"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          ルールの内容
          <textarea
            className="task-input min-h-28"
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          ルールのカテゴリ
          <select
            aria-label="ルールのカテゴリ"
            className="task-input"
            value={selected}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? '（アーカイブ）' : ''}
              </option>
            ))}
          </select>
        </label>
        {!available.length ? (
          <p>
            利用できるカテゴリがありません。カテゴリ管理で追加または再利用してください。
          </p>
        ) : null}
        <label className="block text-sm">
          見直し日（任意）
          <input
            className="task-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <p className="text-sm text-muted">
          {entry
            ? 'カテゴリ・見直し日だけの変更も含め、保存すると2人とも未合意に戻ります。'
            : '登録直後は未合意です。内容を確認してから本人が合意してください。'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="task-primary"
            disabled={busy || disabled || !available.length}
          >
            {busy
              ? '保存中…'
              : restoring
                ? '再開する'
                : entry
                  ? '保存する'
                  : '登録する'}
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
