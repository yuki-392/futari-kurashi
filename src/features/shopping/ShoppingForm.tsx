import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { assigneeLabel } from '../tasks/model'
import { useOnline } from '../tasks/useTasks'
import {
  categories,
  shoppingPriorities,
  cleanShoppingInput,
  parseBudget,
  shoppingMessage,
} from './model'
import type { ShoppingInput, ShoppingItem } from './model'
export function ShoppingForm({
  item,
  onSave,
  onCancel,
}: {
  item?: ShoppingItem
  onSave: (value: ShoppingInput) => Promise<void>
  onCancel?: () => void
}) {
  const { uid, household } = useHousehold(),
    members = household!.memberIds,
    online = useOnline()
  const initial = () => ({
    title: item?.title ?? '',
    category: item?.category ?? 'other',
    quantity: item?.quantity ?? '1',
    unit: item?.unit ?? '個',
    priority: item?.priority ?? 2,
  })
  const [draft, setDraft] = useState(initial),
    [budget, setBudget] = useState(item?.budget?.toString() ?? '')
  const label = item ? assigneeLabel(item.assigneeIds, uid) : '自分'
  const [assignee, setAssignee] = useState(
    label === '未担当'
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
          choice = String(fields.get('assignee'))
        let input: ShoppingInput
        try {
          if (['both', 'partner'].includes(choice) && members.length !== 2)
            throw new Error('相手の参加後に選択してください。')
          input = cleanShoppingInput(
            {
              title: String(fields.get('title')),
              category: String(
                fields.get('category'),
              ) as ShoppingInput['category'],
              quantity: String(fields.get('quantity')),
              unit: String(fields.get('unit')),
              budget: parseBudget(String(fields.get('budget'))),
              assigneeIds:
                choice === 'none'
                  ? []
                  : choice === 'both'
                    ? members
                    : choice === 'partner'
                      ? members.filter((id) => id !== uid)
                      : [uid],
              priority: Number(
                fields.get('priority'),
              ) as ShoppingInput['priority'],
            },
            members,
          )
        } catch (error) {
          setMessage(shoppingMessage(error))
          return
        }
        lock.current = true
        setBusy(true)
        setMessage('')
        void onSave(input)
          .then(() => {
            if (!item) {
              setDraft(initial())
              setBudget('')
              setAssignee('self')
              setMessage('買い物を追加しました。')
            }
          })
          .catch((error) => setMessage(shoppingMessage(error)))
          .finally(() => {
            lock.current = false
            setBusy(false)
          })
      }}
    >
      <h2 className="font-bold">{item ? '買い物を編集' : '買い物を追加'}</h2>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">
          商品名
          <input
            name="title"
            className="task-input"
            autoComplete="off"
            value={draft.title}
            onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          カテゴリ
          <select
            name="category"
            aria-label="カテゴリ"
            className="task-input"
            value={draft.category}
            onChange={(e) =>
              setDraft((v) => ({
                ...v,
                category: e.target.value as ShoppingInput['category'],
              }))
            }
          >
            {Object.entries(categories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0 text-sm">
            数量
            <input
              name="quantity"
              inputMode="decimal"
              className="task-input"
              value={draft.quantity}
              onChange={(e) =>
                setDraft((v) => ({ ...v, quantity: e.target.value }))
              }
            />
          </label>
          <label className="block min-w-0 text-sm">
            単位
            <input
              name="unit"
              className="task-input"
              autoComplete="off"
              value={draft.unit}
              onChange={(e) =>
                setDraft((v) => ({ ...v, unit: e.target.value }))
              }
            />
          </label>
        </div>
        <label className="block text-sm">
          予算（円・任意）
          <input
            name="budget"
            aria-label="予算（円・任意）"
            inputMode="numeric"
            className="task-input"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <span className="mt-2 block text-muted">
            この項目全体の予算です。実際の支出は登録されません。
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            担当
            <select
              name="assignee"
              aria-label="担当"
              className="task-input"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="none">未担当</option>
              <option value="self">自分</option>
              <option value="partner" disabled={members.length < 2}>
                相手
              </option>
              <option value="both" disabled={members.length < 2}>
                2人
              </option>
            </select>
          </label>
          <label className="block text-sm">
            優先度
            <select
              name="priority"
              aria-label="優先度"
              className="task-input"
              value={draft.priority}
              onChange={(e) =>
                setDraft((v) => ({
                  ...v,
                  priority: Number(e.target.value) as ShoppingInput['priority'],
                }))
              }
            >
              {Object.entries(shoppingPriorities).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
