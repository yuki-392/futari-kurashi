import { useState } from 'react'
import { useHousehold } from '../household/context'
import { TaskForm } from './TaskForm'
import { TaskList } from './TaskList'
import { useOnline, useTasks } from './useTasks'
import { useTokyoDay } from './useTokyoDay'
import { createTask, changeTask } from './service'
import type { Task } from './model'
export function TasksPanel() {
  const [completed, setCompleted] = useState(false),
    [count, setCount] = useState(100),
    [editing, setEditing] = useState<Task | null>(null)
  const { uid, household } = useHousehold(),
    today = useTokyoDay(),
    online = useOnline()
  const list = useTasks({ completed, count })
  return (
    <div className="space-y-6">
      {!online ? (
        <p className="rounded-xl bg-sage p-4 text-sm">
          オフラインです。通信を戻してから操作してください。表示は最後に確認できた内容です。
        </p>
      ) : null}
      <TaskForm
        key={editing ? `${editing.id}:${editing.version}` : 'new'}
        {...(editing
          ? { task: editing, onCancel: () => setEditing(null) }
          : {})}
        onSave={async (input) => {
          if (editing) {
            await changeTask(
              household!.id,
              uid,
              editing,
              input,
              household!.memberIds,
            )
            setEditing(null)
          } else
            await createTask(household!.id, uid, input, household!.memberIds)
        }}
      />
      <section aria-label="ToDo一覧">
        <div className="mb-4 flex gap-3">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              aria-pressed={completed === value}
              className={
                completed === value
                  ? 'task-primary'
                  : 'rounded-xl border border-line bg-white px-4 py-3'
              }
              onClick={() => {
                setCompleted(value)
                setCount(100)
                setEditing(null)
              }}
            >
              {value ? '完了済み' : '未完了'}
            </button>
          ))}
        </div>
        {list.status === 'loading' ? (
          <p role="status">ToDoを読み込み中です…</p>
        ) : list.status === 'error' ? (
          <>
            <p role="status">
              ToDoを取得できませんでした。通信を確認してください。
            </p>
            <button className="task-primary mt-3" onClick={list.retry}>
              再試行
            </button>
          </>
        ) : (
          <>
            {list.tasks.length === 0 ? (
              <p>
                {completed
                  ? '完了済みのToDoはありません。'
                  : '未完了のToDoはありません。'}
              </p>
            ) : (
              <TaskList
                key={String(completed)}
                tasks={list.tasks}
                today={today}
                onEdit={(task) => {
                  setEditing(task)
                  window.scrollTo(0, 0)
                }}
              />
            )}
            {list.more ? (
              <button
                className="mt-4 min-h-11 px-4 py-3 underline"
                onClick={() => setCount((n) => n + 100)}
              >
                さらに100件表示
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
