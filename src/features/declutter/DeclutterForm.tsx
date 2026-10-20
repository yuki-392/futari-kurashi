import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { ownerLabel } from './model'
import { useOnline } from '../tasks/useTasks'
import { methods, cleanDeclutterInput, declutterMessage } from './model'
import type { DeclutterInput, DeclutterItem } from './model'
export function DeclutterForm({
  item,
  onSave,
  onCancel,
}: {
  item?: DeclutterItem
  onSave: (value: DeclutterInput) => Promise<void>
  onCancel?: () => void
}) {
  const { uid, household } = useHousehold(),
    members = household!.memberIds,
    online = useOnline()
  const initial = () => ({
    title: item?.title ?? '',
    method: item?.method ?? 'hold',
    dueDate: item?.dueDate ?? '',
  })
  const [draft, setDraft] = useState(initial)
  const label = item ? ownerLabel(item.ownerIds, uid) : '自分'
  const [owner, setOwner] = useState(
    label === '未設定'
      ? 'none'
      : label === '2人'
        ? 'both'
        : label === '相手'
          ? 'partner'
          : 'self',
  )
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    lock = useRef(false),
    feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (message) feedback.current?.focus()
  }, [message])
  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border border-line bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (lock.current) return
        if (!online) {
          setMessage(
            '通信を確認し、オンラインに戻ってからもう一度お試しください。',
          )
          return
        }
        const fields = new FormData(e.currentTarget),
          choice = String(fields.get('owner'))
        let input: DeclutterInput
        try {
          if (['both', 'partner'].includes(choice) && members.length !== 2)
            throw new Error('相手の参加後に選択してください。')
          input = cleanDeclutterInput(
            {
              title: String(fields.get('title')),
              method: String(fields.get('method')) as DeclutterInput['method'],
              dueDate: String(fields.get('dueDate')) || null,
              ownerIds:
                choice === 'none'
                  ? []
                  : choice === 'both'
                    ? members
                    : choice === 'partner'
                      ? members.filter((id) => id !== uid)
                      : [uid],
            },
            members,
          )
        } catch (error) {
          setMessage(declutterMessage(error))
          return
        }
        lock.current = true
        setBusy(true)
        setMessage('')
        void onSave(input)
          .then(() => {
            if (!item) {
              setDraft(initial())
              setOwner('self')
              setMessage('処分候補を追加しました。')
            }
          })
          .catch((error) => setMessage(declutterMessage(error)))
          .finally(() => {
            lock.current = false
            setBusy(false)
          })
      }}
    >
      <h2 className="font-bold">
        {item ? '処分候補を編集' : '処分候補を追加'}
      </h2>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">
          品名
          <input
            name="title"
            className="task-input"
            autoComplete="off"
            value={draft.title}
            onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          処分方法
          <select
            name="method"
            aria-label="処分方法"
            className="task-input"
            value={draft.method}
            onChange={(e) =>
              setDraft((v) => ({
                ...v,
                method: e.target.value as DeclutterInput['method'],
              }))
            }
          >
            {Object.entries(methods).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          期限（任意）
          <input
            name="dueDate"
            aria-label="期限（任意）"
            type="date"
            className="task-input"
            value={draft.dueDate}
            onChange={(e) =>
              setDraft((v) => ({ ...v, dueDate: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm">
          所有者
          <select
            name="owner"
            aria-label="所有者"
            className="task-input"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="none">未設定</option>
            <option value="self">自分</option>
            <option value="partner" disabled={members.length < 2}>
              相手
            </option>
            <option value="both" disabled={members.length < 2}>
              2人
            </option>
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="task-primary">
            {busy ? '保存中…' : item ? '保存する' : '追加する'}
          </button>
          {onCancel ? (
            <button
              type="button"
              className="px-4 py-3 underline"
              onClick={onCancel}
            >
              キャンセル
            </button>
          ) : null}
        </div>
      </fieldset>
      {message ? (
        <p
          ref={feedback}
          role="status"
          tabIndex={-1}
          className="rounded-xl bg-sage p-4 text-sm leading-7"
        >
          {message}
        </p>
      ) : null}
    </form>
  )
}
