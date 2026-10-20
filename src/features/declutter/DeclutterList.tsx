import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { isOverdue } from '../tasks/model'
import { useTokyoDay } from '../tasks/useTokyoDay'
import { methods, ownerLabel, completionLabel, declutterMessage } from './model'
import type { DeclutterItem } from './model'
import { changeDeclutter, removeDeclutter } from './service'
import { useOnline } from '../tasks/useTasks'
export function DeclutterList({
  items,
  onEdit,
}: {
  items: DeclutterItem[]
  onEdit?: (item: DeclutterItem) => void
}) {
  const { uid, household } = useHousehold()
  const today = useTokyoDay()
  const [deleting, setDeleting] = useState<DeclutterItem | null>(null),
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
      setMessage(declutterMessage(error))
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
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-line bg-white p-5"
          >
            <p className="break-words font-semibold">{item.title}</p>
            <p className="mt-2 text-sm leading-7 text-muted">
              所有者：{ownerLabel(item.ownerIds, uid)} · {methods[item.method]}
            </p>
            <p className="text-sm leading-7">
              期限：{item.dueDate ?? 'なし'}
              {isOverdue(item.dueDate, item.completed, today)
                ? ' · 期限切れ'
                : ''}
            </p>
            {item.completed ? (
              <p className="text-sm leading-7">
                完了日時：{completionLabel(item.completedAt)} ·
                完了を記録した人：{item.completedBy === uid ? '自分' : '相手'}
              </p>
            ) : null}
            {onEdit ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  className="task-primary"
                  aria-label={`${item.completed ? '未処分に戻す' : '処分済みにする'}：${item.title}`}
                  onClick={() =>
                    void run(() =>
                      item.method === 'hold' && !item.completed
                        ? Promise.reject(
                            new Error(
                              '処分方法を捨てる・売る・譲るへ変更してから完了してください。',
                            ),
                          )
                        : changeDeclutter(
                            household!.id,
                            uid,
                            item,
                            { completed: !item.completed },
                            household!.memberIds,
                          ),
                    )
                  }
                >
                  {item.completed ? '未処分に戻す' : '処分済みにする'}
                </button>
                <button
                  disabled={busy}
                  className="px-3 py-3 underline"
                  aria-label={`編集：${item.title}`}
                  onClick={() => {
                    setDeleting(null)
                    setMessage('')
                    onEdit(item)
                  }}
                >
                  編集
                </button>
                <button
                  disabled={busy}
                  className="px-3 py-3 underline"
                  aria-label={`削除：${item.title}`}
                  onClick={(event) => {
                    source.current = event.currentTarget
                    setDeleting(item)
                    setMessage('')
                  }}
                >
                  削除
                </button>
              </div>
            ) : null}
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
            「{deleting.title}」を削除しますか？
            {deleting.completed
              ? '完了情報も消え、復元できません。'
              : 'この操作は元に戻せません。'}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              ref={confirm}
              disabled={busy}
              className="task-primary"
              onClick={() =>
                void run(() => removeDeclutter(household!.id, uid, deleting))
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
