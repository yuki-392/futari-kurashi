import { useState } from 'react'
import { useTasks, useOnline } from './useTasks'
import { useTokyoDay } from './useTokyoDay'
import { TaskList } from './TaskList'
export function TodayTasks() {
  const today = useTokyoDay()
  return <TodayList key={today} today={today} />
}
function TodayList({ today }: { today: string }) {
  const [count, setCount] = useState(10)
  const list = useTasks({ completed: false, dueDate: today, count }),
    online = useOnline()
  return (
    <section className="mt-8" aria-labelledby="today-tasks-title">
      <h2 id="today-tasks-title" className="text-lg font-bold">
        今日のToDo
      </h2>
      <p className="mb-4 mt-2 text-sm text-muted">{today}が期限の未完了ToDo</p>
      {!online ? (
        <p className="mb-4 text-sm">
          オフラインです。通信を戻してから操作してください。
        </p>
      ) : null}
      {list.status === 'loading' ? (
        <p role="status">今日のToDoを読み込み中です…</p>
      ) : list.status === 'error' ? (
        <>
          <p role="status">今日のToDoを取得できませんでした。</p>
          <button className="task-primary mt-3" onClick={list.retry}>
            再試行
          </button>
        </>
      ) : (
        <>
          {list.tasks.length === 0 ? (
            <p className="rounded-2xl bg-white p-5 text-sm">
              今日が期限の未完了ToDoはありません。
            </p>
          ) : (
            <TaskList tasks={list.tasks} today={today} />
          )}
          {list.more ? (
            <button
              className="mt-4 px-4 py-3 underline"
              onClick={() => setCount((n) => n + 10)}
            >
              さらに10件表示
            </button>
          ) : null}
        </>
      )}
      <a
        className="mt-4 inline-flex min-h-11 items-center text-sm text-forest underline"
        href="#/chores"
      >
        家事でToDoを管理する
      </a>
    </section>
  )
}
