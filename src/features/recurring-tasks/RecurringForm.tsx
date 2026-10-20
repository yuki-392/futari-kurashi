import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { assigneeLabel, tokyoDate } from '../tasks/model'
import { useOnline } from '../tasks/useTasks'
import { frequencies, validateRecurring, recurringMessage } from './model'
import type { Recurring, RecurringInput } from './model'
export function RecurringForm({
  value,
  onSave,
  onCancel,
  requirePlace = false,
}: {
  value?: Recurring
  requirePlace?: boolean
  onSave: (value: RecurringInput) => Promise<void>
  onCancel?: () => void
}) {
  const { uid, household } = useHousehold(),
    members = household!.memberIds,
    online = useOnline()
  const [title, setTitle] = useState(value?.title ?? ''),
    [priority, setPriority] = useState(value?.priority ?? 'medium'),
    [frequency, setFrequency] = useState(value?.frequency ?? 'weekly')
  const label = value ? assigneeLabel(value.assigneeIds, uid) : '自分'
  const [assignee, setAssignee] = useState(
    label === '2人'
      ? 'both'
      : label === '未担当'
        ? 'none'
        : label === '相手'
          ? 'partner'
          : 'self',
  )
  const [place, setPlace] = useState(value?.place ?? ''),
    [rotation, setRotation] = useState(value?.rotation === 'alternate')
  const [start, setStart] = useState(value?.startDate ?? tokyoDate()),
    [next, setNext] = useState(value?.nextDueDate ?? tokyoDate())
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    lock = useRef(false),
    feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (message) feedback.current?.focus()
  }, [message])
  return (
    <form
      className="space-y-4 rounded-2xl border border-line bg-white p-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (lock.current) return
        if (!online) {
          setMessage(
            '通信を確認し、オンラインに戻ってからもう一度お試しください。',
          )
          return
        }
        const fields = new FormData(event.currentTarget),
          choice = String(fields.get('assignee')),
          startDate = String(fields.get('startDate'))
        let input: RecurringInput
        try {
          if ((choice === 'both' || choice === 'partner') && members.length < 2)
            throw new Error('相手の参加後に選択してください。')
          input = validateRecurring(
            {
              place: String(fields.get('place') ?? ''),
              rotation: fields.get('rotation') === 'on' ? 'alternate' : 'fixed',
              title: String(fields.get('title') ?? ''),
              priority: String(
                fields.get('priority'),
              ) as RecurringInput['priority'],
              frequency: String(
                fields.get('frequency'),
              ) as RecurringInput['frequency'],
              startDate,
              nextDueDate: value
                ? String(fields.get('nextDueDate'))
                : startDate,
              assigneeIds:
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
          setMessage(recurringMessage(error))
          return
        }
        lock.current = true
        setBusy(true)
        setMessage('')
        void onSave(input)
          .then(() => {
            if (!value) {
              setTitle('')
              setMessage('繰り返し家事を登録しました。')
            }
          })
          .catch((error) => setMessage(recurringMessage(error)))
          .finally(() => {
            lock.current = false
            setBusy(false)
          })
      }}
    >
      <h2 className="font-bold">
        {value ? '繰り返し家事を編集' : '繰り返し家事を登録'}
      </h2>
      <fieldset className="space-y-4" disabled={busy}>
        <label className="block text-sm">
          タイトル
          <input
            name="title"
            className="task-input"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            担当
            <select
              aria-label="担当"
              name="assignee"
              className="task-input"
              value={assignee}
              onChange={(e) => {
                setAssignee(e.target.value)
                if (['both', 'none'].includes(e.target.value))
                  setRotation(false)
              }}
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
              aria-label="優先度"
              name="priority"
              className="task-input"
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as RecurringInput['priority'])
              }
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          掃除場所
          <input
            aria-label="掃除場所"
            name="place"
            className="task-input"
            autoComplete="off"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
          <span className="block mt-2 text-muted">
            {requirePlace
              ? '掃除の登録には場所を入力してください。一般家事は「繰り返し」から登録できます。'
              : '未入力なら一般の繰り返し家事です。'}
          </span>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            name="rotation"
            type="checkbox"
            checked={rotation}
            disabled={
              members.length !== 2 || ['both', 'none'].includes(assignee)
            }
            onChange={(e) => setRotation(e.target.checked)}
          />
          担当を交代する
        </label>
        <p className="text-sm text-muted">
          2人の世帯で担当1人のときに設定できます。完了するたび相手へ交代します。
        </p>
        <label className="block text-sm">
          頻度
          <select
            aria-label="頻度"
            name="frequency"
            className="task-input"
            value={frequency}
            onChange={(e) =>
              setFrequency(e.target.value as RecurringInput['frequency'])
            }
          >
            {Object.entries(frequencies).map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0 text-sm">
          開始日
          <input
            type="date"
            min="1000-01-01"
            max="9999-12-31"
            name="startDate"
            aria-label="開始日"
            className="task-input min-w-0"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <p className="text-sm leading-7 text-muted">
          毎週は開始日の曜日、毎月は開始日の日付が基準です。存在しない月日は末日になります。
        </p>
        {value ? (
          <label className="block min-w-0 text-sm">
            次回予定
            <input
              type="date"
              min="1000-01-01"
              max="9999-12-31"
              name="nextDueDate"
              aria-label="次回予定"
              className="task-input min-w-0"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <span className="mt-2 block leading-7 text-muted">
              設定を保存すると、以前の完了は取り消せなくなります。次回予定を確認してください。
            </span>
          </label>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button className="task-primary" type="submit">
            {busy ? '保存中…' : value ? '保存する' : '登録する'}
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
          tabIndex={-1}
          role="status"
          className="rounded-xl bg-sage p-4 text-sm leading-7"
        >
          {message}
        </p>
      ) : null}
    </form>
  )
}
