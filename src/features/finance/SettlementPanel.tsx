import { useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { useTokyoDay } from '../tasks/useTokyoDay'
import { useOnline } from '../tasks/useTasks'
import { financeMessage, formatYen } from './model'
import { paymentInput, settlementTotals } from './settlementModel'
import type { SettlementPayment } from './settlementModel'
import {
  recordSettlementPayment,
  cancelSettlementPayment,
} from './settlementService'
import { useSettlements } from './useSettlements'
export function SettlementPanel({ month }: { month: string }) {
  const { uid, household } = useHousehold()
  const data = useSettlements(month)
  const online = useOnline(),
    today = useTokyoDay()
  const [form, setForm] = useState<{
    fromUid: string
    amount: string
    date: string
    version: number
  } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [cancel, setCancel] = useState<{
    payment: SettlementPayment
    version: number
  } | null>(null)
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const lock = useRef(false)
  if (data.status === 'error')
    return (
      <div>
        <p role="status">
          精算を取得できませんでした。通信を確認してください。
        </p>
        <button className="task-primary" onClick={data.retry}>
          再試行
        </button>
      </div>
    )
  if (data.status !== 'ready')
    return (
      <p role="status">
        {online
          ? '精算を読み込み中です…'
          : 'オフラインです。通信を戻すと精算を再取得します。'}
      </p>
    )
  if (!data.complete)
    return (
      <p role="status">
        取得上限に達したため、正確な精算額を表示・確定できません。各集計は10,000件未満が対象です。
      </p>
    )
  if (!household || household.memberIds.length !== 2)
    return <p>2人が世帯へ参加すると精算を利用できます。</p>
  const owner = household.ownerId,
    members = household.memberIds,
    other = members.find((id) => id !== owner)!
  const label = (id: string) => (id === uid ? '自分' : '相手')
  let totals, all
  try {
    totals = settlementTotals(data.expenses, data.months, owner, month)
    all = settlementTotals(data.expenses, data.months, owner)
  } catch (error) {
    return (
      <p role="status">
        {financeMessage(error)}{' '}
        正確な残額を確認できないため精算操作を停止しています。
      </p>
    )
  }
  const ledger = data.months.find((m) => m.month === month),
    version = ledger?.version ?? 0
  const direction = (n: number) =>
    n === 0
      ? '精算の差額はありません'
      : `${label(n > 0 ? other : owner)}から${label(n > 0 ? owner : other)}へ ${formatYen(Math.abs(n))}`
  const monthNames = [
    ...new Set([
      ...data.expenses.map((e) => e.date.slice(0, 7)),
      ...data.months.map((m) => m.month),
    ]),
  ]
    .sort()
    .reverse()
  const unpaid = monthNames
    .map((m) => ({
      month: m,
      ...settlementTotals(data.expenses, data.months, owner, m),
    }))
    .filter((m) => m.remaining !== 0)
  async function perform(fn: () => Promise<void>, done: string) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      await fn()
      setForm(null)
      setConfirm(false)
      setCancel(null)
      setMessage(done)
    } catch (e) {
      setMessage(financeMessage(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const start = (full: boolean) => {
    setCancel(null)
    setConfirm(false)
    setMessage('')
    setForm({
      fromUid: totals.remaining > 0 ? other : owner,
      amount: full ? String(Math.abs(totals.remaining)) : '',
      date: today,
      version,
    })
  }
  return (
    <div className="space-y-5">
      {!online ? (
        <p role="status">オフラインです。通信を戻してから操作してください。</p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-xl bg-sage p-4">
          {message}
        </p>
      ) : null}
      <section
        aria-label="月別の精算"
        className="space-y-3 rounded-2xl bg-white p-5"
      >
        <h2 className="font-bold">{month}の精算</h2>
        <p className="text-sm">
          精算対象の支出のみで計算します。未設定・対象外の支出と収入は含みません。
        </p>
        {members.map((id) => (
          <p key={id}>
            {label(id)}：支払額 {formatYen(totals.paid[id] ?? 0)} ／ 負担額{' '}
            {formatYen(totals.burden[id] ?? 0)}
          </p>
        ))}
        <p>元の精算額：{direction(totals.base)}</p>
        {totals.remaining === 0 && totals.netPaid !== 0 ? (
          <p className="font-bold">精算済み</p>
        ) : null}
        <p className="font-bold" data-testid="settlement-remaining">
          残り：{direction(totals.remaining)}
        </p>
        <p className="text-sm">
          支払いを記録しても元の精算額は残ります。支出を修正・削除すると差額を再計算します。アプリから送金は行いません。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="task-primary"
            disabled={!online || busy || totals.remaining === 0}
            onClick={() => start(true)}
          >
            残額を精算済みにする
          </button>
          <button
            className="rounded-xl border border-line px-4 py-3"
            disabled={!online || busy}
            onClick={() => start(false)}
          >
            部分払いを記録
          </button>
        </div>
      </section>
      {form ? (
        <form
          className="space-y-3 rounded-2xl border border-line bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (lock.current) return
            const toUid = members.find((id) => id !== form.fromUid)!
            try {
              const input = paymentInput(
                month,
                form.fromUid,
                toUid,
                Number(form.amount),
                form.date,
                members,
              )
              if (!confirm) {
                setConfirm(true)
                return
              }
              void perform(
                () =>
                  recordSettlementPayment(
                    household.id,
                    uid,
                    input,
                    form.version,
                  ),
                '精算金を記録しました。',
              )
            } catch (e) {
              setMessage(financeMessage(e))
            }
          }}
        >
          <h3 className="font-bold">支払いの確認</h3>
          <fieldset disabled={busy} className="space-y-3">
            <label className="block">
              支払う人
              <select
                className="task-input"
                value={form.fromUid}
                disabled={confirm}
                onChange={(e) => setForm({ ...form, fromUid: e.target.value })}
              >
                {members.map((id) => (
                  <option key={id} value={id}>
                    {label(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              精算金（円）
              <input
                className="task-input"
                inputMode="numeric"
                type="number"
                min="1"
                max="9999999999999"
                step="1"
                value={form.amount}
                disabled={confirm}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <label className="block">
              支払日
              <input
                className="task-input"
                type="date"
                value={form.date}
                disabled={confirm}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            {confirm ? (
              <p>
                {label(form.fromUid)}から
                {label(members.find((id) => id !== form.fromUid)!)}へ{' '}
                {formatYen(Number(form.amount))}（{form.date}）。
                {(
                  form.fromUid === (totals.remaining > 0 ? other : owner)
                    ? Number(form.amount) > Math.abs(totals.remaining)
                    : true
                )
                  ? '残額を超えるか、残額と逆方向の支払いです。逆方向の差額が生じます。'
                  : ''}
                実際に支払った金額として記録します。
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button className="task-primary" disabled={!online || busy}>
                {busy
                  ? '保存中…'
                  : confirm
                    ? '確定して記録'
                    : '支払いを記録する'}
              </button>
              <button
                type="button"
                className="rounded-xl border border-line px-4 py-3"
                onClick={() => {
                  setForm(null)
                  setConfirm(false)
                }}
              >
                キャンセル
              </button>
            </div>
            {form.version !== version ? (
              <p>
                別の端末で変更されました。入力は保持しています。確認後に下の操作で最新の月の状態を使って再確認してください。
                <button
                  type="button"
                  className="task-primary"
                  onClick={() => {
                    setForm({ ...form, version })
                    setConfirm(false)
                  }}
                >
                  最新状態で再確認
                </button>
              </p>
            ) : null}
          </fieldset>
        </form>
      ) : null}
      <section aria-label="精算金の記録" className="space-y-3">
        <h2 className="font-bold">精算金の記録</h2>
        {data.payments.length === 0 ? (
          <p>この月の支払い記録はありません。</p>
        ) : (
          data.payments.map((p) => (
            <article key={p.id} className="rounded-2xl bg-white p-4">
              <p>
                {p.date} · {label(p.fromUid)}から{label(p.toUid)}へ{' '}
                {formatYen(p.amount)}
              </p>
              <p className="text-sm">
                記録者：{label(p.createdBy)}（{recordTime(p.createdAt)}） ·{' '}
                {p.canceledAt
                  ? `取消済み（取消者：${label(p.canceledBy!)}） ${recordTime(p.canceledAt)}`
                  : '記録済み'}
              </p>
              {!p.canceledAt ? (
                <button
                  className="rounded-xl border border-line px-4 py-3"
                  disabled={!online || busy}
                  onClick={() => {
                    setForm(null)
                    setCancel({ payment: p, version })
                  }}
                >
                  この支払い記録を取り消す
                </button>
              ) : null}
            </article>
          ))
        )}
      </section>
      {cancel ? (
        <section
          className="space-y-3 rounded-2xl bg-sage p-5"
          aria-label="精算取消の確認"
        >
          <p>
            {formatYen(cancel.payment.amount)}
            の支払い記録を取り消しますか？実際のお金の返金は行いません。
          </p>
          <button
            className="task-primary"
            disabled={!online || busy}
            onClick={() =>
              void perform(
                () =>
                  cancelSettlementPayment(
                    household.id,
                    uid,
                    cancel.payment,
                    cancel.version,
                  ),
                '支払い記録を取り消しました。',
              )
            }
          >
            取消を確定する
          </button>
          <button
            className="ml-2 rounded-xl border border-line px-4 py-3"
            disabled={busy}
            onClick={() => setCancel(null)}
          >
            キャンセル
          </button>
        </section>
      ) : null}
      <section
        aria-label="全期間の未精算"
        className="space-y-3 rounded-2xl bg-white p-5"
      >
        <h2 className="font-bold">全期間の未精算</h2>
        <p data-testid="settlement-all">
          相殺後の差額：{direction(all.remaining)}
        </p>
        {unpaid.length ? (
          <>
            <p>
              未精算の月があります。月同士の差額が相殺されても、支払い記録のない月は未精算として残ります。
            </p>
            <ul>
              {unpaid.map((m) => (
                <li key={m.month}>
                  {m.month}：{direction(m.remaining)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>未精算の月はありません。</p>
        )}
      </section>
    </div>
  )
}

function recordTime(value: unknown) {
  return value && typeof value === 'object' && 'toDate' in value
    ? (value as { toDate(): Date })
        .toDate()
        .toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
    : '日時確認中'
}
