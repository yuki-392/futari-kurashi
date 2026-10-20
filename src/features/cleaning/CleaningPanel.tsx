import { useState } from 'react'
import { useHousehold } from '../household/context'
import { useTokyoDay } from '../tasks/useTokyoDay'
import { assigneeLabel } from '../tasks/model'
import { RecurringForm } from '../recurring-tasks/RecurringForm'
import { RecordsState, RecurringList } from '../recurring-tasks/RecurringPanels'
import { useRecurring } from '../recurring-tasks/useRecurring'
import { createRecurring, editRecurring } from '../recurring-tasks/service'
import type { Recurring } from '../recurring-tasks/model'
import { addDays, cleaningOccurrences, weekBounds } from './model'
export function CleaningPanel() {
  const today = useTokyoDay()
  return <Cleaning today={today} />
}
function Cleaning({ today }: { today: string }) {
  const { uid, household } = useHousehold()
  const [mode, setMode] = useState<'today' | 'week'>('today'),
    [filter, setFilter] = useState(''),
    [draft, setDraft] = useState('')
  const [form, setForm] = useState(false),
    [editing, setEditing] = useState<Recurring | null>(null)
  const bounds = weekBounds(today)
  return (
    <section className="space-y-5" aria-label="掃除スケジュール">
      <h2 className="text-lg font-bold">掃除スケジュール</h2>
      <p className="text-sm leading-7">
        場所付きの繰り返し家事を表示します。停止中の確認・再開は「繰り返し」から行えます。
      </p>
      <button
        className="task-primary"
        onClick={() => {
          setEditing(null)
          setForm((v) => !v)
        }}
      >
        掃除を登録する
      </button>
      {form ? (
        <RecurringForm
          key={editing ? `${editing.id}:${editing.version}` : 'new'}
          requirePlace={!editing}
          value={editing ?? undefined}
          onCancel={() => {
            setForm(false)
            setEditing(null)
          }}
          onSave={async (value) => {
            if (!value.place && !editing)
              throw new Error('掃除場所を入力してください。')
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
      ) : null}
      <div className="flex gap-3" role="group" aria-label="掃除の期間">
        <button
          className={mode === 'today' ? 'task-primary' : 'px-4 py-3 underline'}
          aria-pressed={mode === 'today'}
          onClick={() => setMode('today')}
        >
          今日
        </button>
        <button
          className={mode === 'week' ? 'task-primary' : 'px-4 py-3 underline'}
          aria-pressed={mode === 'week'}
          onClick={() => setMode('week')}
        >
          今週
        </button>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setFilter(draft.trim())
        }}
      >
        <label className="min-w-0 flex-1 text-sm">
          場所で絞り込み
          <input
            className="task-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={40}
          />
        </label>
        <button className="px-4 py-3 underline">適用</button>
        <button
          type="button"
          className="px-4 py-3 underline"
          onClick={() => {
            setDraft('')
            setFilter('')
          }}
        >
          すべての場所
        </button>
      </form>
      <p className="text-sm">
        {mode === 'week' ? `${bounds.start}〜${bounds.end}（月〜日）` : today}
        {filter ? ` · 場所：${filter}` : ''}
      </p>
      {mode === 'week' ? (
        <p className="text-sm leading-7">
          「予定」は未完了を順に完了した場合の予定と担当です。完了できるのは現在の未完了1件だけです。持ち越しは今日完了する想定で計算します。
        </p>
      ) : null}
      <CleaningRecords
        key={`${today}:${mode}:${filter}`}
        today={today}
        end={mode === 'week' ? bounds.end : today}
        mode={mode}
        place={filter}
        onEdit={(value) => {
          setEditing(value)
          setForm(true)
          window.scrollTo(0, 0)
        }}
      />
    </section>
  )
}
function CleaningRecords({
  today,
  end,
  mode,
  place,
  onEdit,
}: {
  today: string
  end: string
  mode: string
  place: string
  onEdit: (v: Recurring) => void
}) {
  const [count, setCount] = useState(100),
    { uid, household } = useHousehold()
  const list = useRecurring<Recurring>({ kind: 'cleaning', end, place, count })
  const pending = list.items.filter((v) => v.nextDueDate < today)
  const days =
    mode === 'week'
      ? Array.from({ length: 7 }, (_, i) => addDays(weekBounds(today).start, i))
      : [today]
  return (
    <RecordsState status={list.status} retry={list.retry}>
      {!list.items.length ? (
        <p>対象の掃除はありません。</p>
      ) : (
        <>
          {pending.length ? (
            <section aria-label="持ち越しの掃除">
              <h3 className="mb-3 font-bold">持ち越し</h3>
              <RecurringList items={pending} today={today} onEdit={onEdit} />
            </section>
          ) : null}
          {days.map((day) => {
            const current = list.items.filter(
              (v) => v.nextDueDate === day && v.nextDueDate >= today,
            )
            const future =
              mode === 'week'
                ? list.items.flatMap((v) =>
                    cleaningOccurrences(v, today, end, household!.memberIds)
                      .filter((x) => x.reference && x.date === day)
                      .map((x) => ({ ...x, value: v })),
                  )
                : []
            return (
              <section key={day} aria-label={`${day}の掃除`} className="mt-5">
                <h3 className="mb-3 font-bold">
                  {day}（
                  {'日月火水木金土'[new Date(`${day}T00:00:00Z`).getUTCDay()]}）
                </h3>
                {current.length ? (
                  <RecurringList
                    items={current}
                    today={today}
                    onEdit={onEdit}
                  />
                ) : null}
                {future.map((x) => (
                  <div
                    key={x.value.id}
                    className="mt-3 rounded-2xl border border-line bg-white p-5"
                  >
                    <p className="break-words font-semibold">
                      {x.value.title} · 予定
                    </p>
                    <p className="break-words text-sm leading-7">
                      場所：{x.value.place} · 担当：
                      {assigneeLabel(x.assigneeIds, uid)}（予定）
                    </p>
                  </div>
                ))}
                {!current.length && !future.length ? (
                  <p className="text-sm text-muted">
                    {list.more
                      ? '取得した範囲に予定はありません。'
                      : '予定はありません。'}
                  </p>
                ) : null}
              </section>
            )
          })}
        </>
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
  )
}
