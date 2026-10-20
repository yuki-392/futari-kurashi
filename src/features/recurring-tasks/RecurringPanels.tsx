import { useState } from 'react'
import { useHousehold } from '../household/context'
import { assigneeLabel, isOverdue, priorities } from '../tasks/model'
import { useTokyoDay } from '../tasks/useTokyoDay'
import { RecurringForm } from './RecurringForm'
import {
  useRecurring,
  useRecurringAction,
  useUndoTargets,
} from './useRecurring'
import {
  createRecurring,
  editRecurring,
  setRecurringActive,
  completeRecurring,
  undoRecurring,
} from './service'
import { frequencies, formatTimestamp } from './model'
import type { Recurring, Completion } from './model'
export function Feedback({
  action: { online, message, busy, feedback },
}: {
  action: ReturnType<typeof useRecurringAction>
}) {
  return (
    <>
      {!online ? (
        <p className="mb-4 rounded-xl bg-sage p-4 text-sm">
          オフラインです。通信を戻してから操作してください。
        </p>
      ) : null}
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
      {busy ? (
        <p role="status" className="mb-3 text-sm">
          処理中です…
        </p>
      ) : null}
    </>
  )
}
export function RecordsState({
  status,
  retry,
  children,
}: {
  status: string
  retry: () => void
  children: React.ReactNode
}) {
  return status === 'loading' ? (
    <p role="status">家事を読み込み中です…</p>
  ) : status === 'error' ? (
    <>
      <p role="status">家事を取得できませんでした。通信を確認してください。</p>
      <button className="task-primary mt-3" onClick={retry}>
        再試行
      </button>
    </>
  ) : (
    children
  )
}
export function RecurringList({
  items,
  today,
  onEdit,
}: {
  items: Recurring[]
  today: string
  onEdit?: (value: Recurring) => void
}) {
  const { uid, household } = useHousehold(),
    action = useRecurringAction()
  return (
    <>
      <Feedback action={action} />
      <ul className="space-y-3">
        {items.map((value) => (
          <li
            key={value.id}
            className="rounded-2xl border border-line bg-white p-5"
          >
            <p className="break-words font-bold">{value.title}</p>
            {value.place ? (
              <p className="break-words text-sm">場所：{value.place}</p>
            ) : null}
            {value.rotation === 'alternate' ? (
              <p className="text-sm">完了ごとに担当交代</p>
            ) : null}
            <p className="mt-2 text-sm leading-7">
              {frequencies[value.frequency]} · 次回：{value.nextDueDate}
              {!value.active ? ' · 一時停止中' : ''}
              {value.active && isOverdue(value.nextDueDate, false, today)
                ? ' · 期限切れ'
                : ''}
            </p>
            <p className="text-sm leading-7 text-muted">
              担当：{assigneeLabel(value.assigneeIds, uid)} · 優先度：
              {priorities[value.priority]}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {value.active ? (
                <button
                  disabled={action.busy}
                  className="task-primary"
                  aria-label={`完了にする：${value.title}`}
                  onClick={() =>
                    void action.run(() =>
                      completeRecurring(household!.id, uid, value),
                    )
                  }
                >
                  完了にする
                </button>
              ) : null}
              {onEdit ? (
                <>
                  <button
                    disabled={action.busy}
                    className="px-3 py-3 underline"
                    aria-label={`編集：${value.title}`}
                    onClick={() => onEdit(value)}
                  >
                    編集
                  </button>
                  <button
                    disabled={action.busy}
                    className="px-3 py-3 underline"
                    aria-label={`${value.active ? '一時停止' : '再開'}：${value.title}`}
                    onClick={() =>
                      void action.run(() =>
                        setRecurringActive(
                          household!.id,
                          uid,
                          value,
                          !value.active,
                        ),
                      )
                    }
                  >
                    {value.active ? '一時停止' : '再開'}
                  </button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
export function RecurringPanel() {
  const { uid, household } = useHousehold(),
    today = useTokyoDay()
  const [count, setCount] = useState(100),
    [editing, setEditing] = useState<Recurring | null>(null),
    list = useRecurring<Recurring>({ kind: 'definitions', count })
  return (
    <div className="space-y-6">
      <RecurringForm
        key={editing ? `${editing.id}:${editing.version}` : 'new'}
        value={editing ?? undefined}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSave={async (value) => {
          if (editing) {
            await editRecurring(
              household!.id,
              uid,
              editing,
              value,
              household!.memberIds,
            )
            setEditing((current) => (current === editing ? null : current))
          } else
            await createRecurring(
              household!.id,
              uid,
              value,
              household!.memberIds,
            )
        }}
      />
      <section aria-label="繰り返し一覧">
        <RecordsState status={list.status} retry={list.retry}>
          {list.items.length ? (
            <RecurringList
              items={list.items}
              today={today}
              onEdit={(value) => {
                setEditing(value)
                window.scrollTo(0, 0)
              }}
            />
          ) : (
            <p>繰り返し家事はまだありません。</p>
          )}
          {list.more ? (
            <button
              className="mt-4 px-4 py-3 underline"
              onClick={() => setCount((n) => n + 100)}
            >
              さらに100件表示
            </button>
          ) : null}
        </RecordsState>
      </section>
    </div>
  )
}
export function HistoryPanel() {
  const [count, setCount] = useState(100),
    list = useRecurring<Completion>({ kind: 'history', count })
  const targets = useUndoTargets(list.items),
    action = useRecurringAction(),
    { uid, household } = useHousehold()
  return (
    <section aria-label="実施履歴">
      <h2 className="mb-3 text-lg font-bold">繰り返し家事の履歴</h2>
      <p className="mb-5 text-sm leading-7 text-muted">
        その後に完了や設定変更・停止/再開がない直近の完了だけ取り消せます。通常ToDoは完了済み一覧で確認できます。
      </p>
      <Feedback action={action} />
      <RecordsState status={list.status} retry={list.retry}>
        {list.items.length ? (
          <ul className="space-y-3">
            {list.items.map((value) => {
              const current = targets[value.scheduleId],
                canUndo =
                  value.cancelledAt === null &&
                  current?.version === value.scheduleVersion &&
                  current.lastCompletionId === value.id
              return (
                <li
                  key={value.id}
                  className="rounded-2xl border border-line bg-white p-5"
                >
                  <p className="break-words font-semibold">{value.title}</p>
                  {value.place ? (
                    <p className="break-words text-sm">場所：{value.place}</p>
                  ) : null}
                  <p className="mt-2 text-sm leading-7">
                    予定日：{value.scheduledDate}
                    <br />
                    完了日時：{formatTimestamp(value.completedAt)}
                    <br />
                    完了を記録：{value.completedBy === uid ? '自分' : '相手'}
                  </p>
                  {value.cancelledAt !== null ? (
                    <p className="mt-2 text-sm leading-7">
                      取消済み · {value.cancelledBy === uid ? '自分' : '相手'} ·{' '}
                      {formatTimestamp(value.cancelledAt)}
                    </p>
                  ) : canUndo ? (
                    <button
                      disabled={action.busy}
                      className="mt-3 px-3 py-3 text-forest underline"
                      aria-label={`完了を取り消す：${value.title}`}
                      onClick={() =>
                        void action.run(() =>
                          undoRecurring(household!.id, uid, value),
                        )
                      }
                    >
                      完了を取り消す
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <p>繰り返し家事の実施履歴はありません。</p>
        )}
        {list.more ? (
          <button
            className="mt-4 px-4 py-3 underline"
            onClick={() => setCount((n) => n + 100)}
          >
            さらに100件表示
          </button>
        ) : null}
      </RecordsState>
    </section>
  )
}
export function TodayRecurring() {
  const today = useTokyoDay()
  return <Today key={today} today={today} />
}
function Today({ today }: { today: string }) {
  const [count, setCount] = useState(10),
    list = useRecurring<Recurring>({ kind: 'today', today, count })
  return (
    <section className="mt-8" aria-labelledby="recurring-today-title">
      <h2 id="recurring-today-title" className="mb-4 text-lg font-bold">
        今日・持ち越しの家事
      </h2>
      <RecordsState status={list.status} retry={list.retry}>
        {list.items.length ? (
          <RecurringList items={list.items} today={today} />
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm">
            今日までの繰り返し家事はありません。
          </p>
        )}
        {list.more ? (
          <button
            className="mt-4 px-4 py-3 underline"
            onClick={() => setCount((n) => n + 10)}
          >
            さらに10件表示
          </button>
        ) : null}
      </RecordsState>
    </section>
  )
}
