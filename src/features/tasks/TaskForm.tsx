import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { assigneeLabel, cleanInput, taskMessage } from './model'
import type { Task, TaskInput } from './model'
import { useOnline } from './useTasks'
export function TaskForm({
  task,
  onSave,
  onCancel,
}: {
  task?: Task
  onSave: (input: TaskInput) => Promise<void>
  onCancel?: () => void
}) {
  const { uid, household } = useHousehold()
  const members = household!.memberIds
  const initial = task ? assigneeLabel(task.assigneeIds, uid) : '自分'
  const [title, setTitle] = useState(task?.title ?? '')
  const [assignee, setAssignee] = useState(
    initial === '未担当'
      ? 'none'
      : initial === '2人'
        ? 'both'
        : initial === '相手'
          ? 'partner'
          : 'self',
  )
  const [dueDate, setDate] = useState(task?.dueDate ?? '')
  const [priority, setPriority] = useState<TaskInput['priority']>(
    task?.priority ?? 'medium',
  )
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const lock = useRef(false),
    feedback = useRef<HTMLParagraphElement>(null)
  const online = useOnline()
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
        if (!online) {
          setMessage(
            '通信を確認し、オンラインに戻ってからもう一度お試しください。',
          )
          return
        }
        const fields = new FormData(event.currentTarget)
        const choice = String(fields.get('assignee'))
        const ids =
          choice === 'none'
            ? []
            : choice === 'both'
              ? members
              : choice === 'partner'
                ? members.filter((id) => id !== uid)
                : [uid]
        let input: TaskInput
        try {
          if (
            (choice === 'both' || choice === 'partner') &&
            members.length !== 2
          )
            throw new Error('相手の参加後に選択してください。')
          input = cleanInput(
            {
              title: String(fields.get('title') ?? ''),
              assigneeIds: ids,
              dueDate: String(fields.get('dueDate') ?? '') || null,
              priority: String(fields.get('priority')) as TaskInput['priority'],
            },
            members,
          )
        } catch (error) {
          setMessage(taskMessage(error))
          return
        }
        lock.current = true
        setBusy(true)
        setMessage('')
        void onSave(input)
          .then(() => {
            if (!task) {
              setTitle('')
              setDate('')
              setAssignee('self')
              setPriority('medium')
            }
          })
          .catch((error) => setMessage(taskMessage(error)))
          .finally(() => {
            lock.current = false
            setBusy(false)
          })
      }}
    >
      <h2 className="font-bold">{task ? 'ToDoを編集' : 'ToDoを追加'}</h2>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">
          タイトル
          <input
            name="title"
            className="task-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
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
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as TaskInput['priority'])
              }
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
        </div>
        <label className="block min-w-0 text-sm">
          期限（任意）
          <input
            name="dueDate"
            type="date"
            min="1000-01-01"
            max="9999-12-31"
            className="task-input min-w-0"
            value={dueDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button className="task-primary" type="submit">
            {busy ? '保存中…' : task ? '保存する' : '追加する'}
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
          role="status"
          ref={feedback}
          tabIndex={-1}
          className="rounded-xl bg-sage p-4 text-sm leading-7"
        >
          {message}
        </p>
      ) : null}
    </form>
  )
}
