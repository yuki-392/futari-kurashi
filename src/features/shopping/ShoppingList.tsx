import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { assigneeLabel } from '../tasks/model'
import { categories, shoppingPriorities, shoppingMessage } from './model'
import type { ShoppingItem } from './model'
import { changeShopping, removeShopping } from './service'
import { useOnline } from '../tasks/useTasks'
export function ShoppingList({
  tasks,
  onEdit,
}: {
  tasks: ShoppingItem[]
  onEdit?: (task: ShoppingItem) => void
}) {
  const { uid, household } = useHousehold()
  const [deleting, setDeleting] = useState<ShoppingItem | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const confirm = useRef<HTMLButtonElement>(null)
  const feedback = useRef<HTMLParagraphElement>(null)
  const source = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (deleting) {
      confirm.current?.focus({ preventScroll: true })
      confirm.current?.scrollIntoView?.({ block: 'center' })
    }
  }, [deleting])
  useEffect(() => {
    if (message) feedback.current?.focus()
  }, [message])
  const lock = useRef(false),
    online = useOnline()
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    if (!online) {
      setMessage('通信を確認し、オンラインに戻ってからもう一度お試しください。')
      return
    }
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      await action()
      setDeleting(null)
    } catch (error) {
      setMessage(shoppingMessage(error))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <>
      {message ? (
        <p
          ref={feedback}
          tabIndex={-1}
          role="status"
          className="mb-4 rounded-xl bg-sage p-4 text-sm leading-7"
        >
          {message}
        </p>
      ) : null}
      <ul className="space-y-3">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="rounded-2xl border border-line bg-white p-5"
          >
            <p className="break-words font-semibold">{task.title}</p>
            <p className="mt-2 text-sm leading-7 text-muted">
              担当：{assigneeLabel(task.assigneeIds, uid)} · 優先度：
              {shoppingPriorities[task.priority]}
            </p>
            <p className="text-sm leading-7 break-words">
              {categories[task.category]} · 数量：{task.quantity}
              {task.unit}
            </p>
            <p className="text-sm leading-7">
              予算：
              {task.budget === null
                ? '未設定'
                : `${task.budget.toLocaleString('ja-JP')}円`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={busy}
                className="task-primary"
                aria-label={`${task.purchased ? '未購入に戻す' : '購入済みにする'}：${task.title}`}
                onClick={() =>
                  void run(() =>
                    changeShopping(
                      household!.id,
                      uid,
                      task,
                      { purchased: !task.purchased },
                      household!.memberIds,
                    ),
                  )
                }
              >
                {task.purchased ? '未購入に戻す' : '購入済みにする'}
              </button>
              {onEdit ? (
                <>
                  <button
                    disabled={busy}
                    className="px-3 py-3 underline"
                    aria-label={`編集：${task.title}`}
                    onClick={() => {
                      setDeleting(null)
                      setMessage('')
                      onEdit(task)
                    }}
                  >
                    編集
                  </button>
                  <button
                    disabled={busy}
                    className="px-3 py-3 underline"
                    aria-label={`削除：${task.title}`}
                    onClick={(event) => {
                      source.current = event.currentTarget
                      setDeleting(task)
                      setMessage('')
                    }}
                  >
                    削除
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {deleting ? (
        <section
          role="group"
          aria-label="削除の確認"
          className="mt-4 rounded-2xl border border-line bg-sage p-5"
        >
          <p className="break-words">
            「{deleting.title}」を削除しますか？この操作は元に戻せません。
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              ref={confirm}
              disabled={busy}
              className="task-primary"
              onClick={() =>
                void run(() => removeShopping(household!.id, uid, deleting))
              }
            >
              {busy ? '削除中…' : '削除する'}
            </button>
            <button
              disabled={busy}
              className="px-3 py-3 underline"
              onClick={() => {
                setDeleting(null)
                if (source.current?.isConnected) source.current.focus()
              }}
            >
              削除をやめる
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
}
