import { useTokyoDay } from '../tasks/useTokyoDay'
import { useState } from 'react'
import { useHousehold } from '../household/context'
import { useOnline } from '../tasks/useTasks'
import { methods } from './model'
import type { DeclutterItem, DeclutterInput } from './model'
import { DeclutterForm } from './DeclutterForm'
import { DeclutterList } from './DeclutterList'
import { useDeclutter } from './useDeclutter'
import { createDeclutter, changeDeclutter } from './service'
function ListState({
  status,
  retry,
  children,
}: {
  status: string
  retry: () => void
  children: React.ReactNode
}) {
  return status === 'loading' ? (
    <p role="status">処分候補を読み込み中です…</p>
  ) : status === 'error' ? (
    <>
      <p role="status">
        処分候補を取得できませんでした。通信を確認してください。
      </p>
      <button className="task-primary mt-3" onClick={retry}>
        再試行
      </button>
    </>
  ) : (
    children
  )
}
function Offline() {
  const online = useOnline()
  return online ? null : (
    <p className="rounded-xl bg-sage p-4 text-sm">
      オフラインです。通信を戻してから操作してください。表示は最後に確認できた内容です。
    </p>
  )
}
export function DeclutterPanel() {
  const { uid, household } = useHousehold()
  const [completed, setCompleted] = useState(false),
    [method, setMethod] = useState<DeclutterInput['method'] | ''>(''),
    [editing, setEditing] = useState<DeclutterItem | null>(null)
  return (
    <div className="space-y-6">
      <Offline />
      <DeclutterForm
        key={editing ? `${editing.id}:${editing.version}` : 'new'}
        item={editing ?? undefined}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSave={async (input) => {
          if (editing) {
            await changeDeclutter(
              household!.id,
              uid,
              editing,
              input,
              household!.memberIds,
            )
            setEditing((current) => (current === editing ? null : current))
          } else
            await createDeclutter(
              household!.id,
              uid,
              input,
              household!.memberIds,
            )
        }}
      />
      <section aria-label="処分候補一覧">
        <div className="mb-4 flex gap-3">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              className={
                value === completed
                  ? 'task-primary'
                  : 'rounded-xl border border-line bg-white px-4 py-3'
              }
              aria-pressed={completed === value}
              onClick={() => {
                setCompleted(value)
                setEditing(null)
              }}
            >
              {value ? '処分済み' : '未処分'}
            </button>
          ))}
        </div>
        <label className="block text-sm mb-5">
          処分方法で絞り込み
          <select
            className="task-input"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="">すべて</option>
            {Object.entries(methods).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <DeclutterRecords
          key={`${completed}:${method}`}
          completed={completed}
          method={method}
          onEdit={(item) => {
            setEditing(item)
            window.scrollTo(0, 0)
          }}
        />
      </section>
    </div>
  )
}
function DeclutterRecords({
  completed,
  method,
  onEdit,
}: {
  completed: boolean
  method: DeclutterInput['method'] | ''
  onEdit: (item: DeclutterItem) => void
}) {
  const [count, setCount] = useState(100),
    list = useDeclutter({ completed, count, ...(method ? { method } : {}) })
  return (
    <ListState status={list.status} retry={list.retry}>
      {list.items.length ? (
        <DeclutterList items={list.items} onEdit={onEdit} />
      ) : (
        <p>
          {completed
            ? '処分済みの処分候補はありません。'
            : '未処分の処分候補はありません。'}
        </p>
      )}
      {list.more ? (
        <button
          className="mt-4 px-4 py-3 underline"
          onClick={() => setCount((n) => n + 100)}
        >
          さらに100件表示
        </button>
      ) : null}
    </ListState>
  )
}
export function HomeDeclutter() {
  const today = useTokyoDay()
  const list = useDeclutter({ completed: false, count: 5, through: today })
  return (
    <section className="mt-8" aria-labelledby="home-declutter-title">
      <h2 id="home-declutter-title" className="mb-4 text-lg font-bold">
        今日までが期限の未処分
      </h2>
      <Offline />
      <ListState status={list.status} retry={list.retry}>
        {list.items.length ? (
          <DeclutterList items={list.items} />
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm">
            未処分の処分候補はありません。
          </p>
        )}
        {list.more ? <p className="mt-3 text-sm">ほかにもあります</p> : null}
      </ListState>
      <a
        className="mt-3 inline-flex min-h-11 items-center text-forest underline"
        href="#/declutter"
      >
        片付けリストを開く
      </a>
    </section>
  )
}
