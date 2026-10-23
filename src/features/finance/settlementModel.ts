import { monthBounds } from './model'
export type Sharing = { payerId: string; shares: Record<string, number> }
export type SettlementMonth = {
  month: string
  netPaid: number
  version: number
  lastKind: 'expense' | 'payment' | 'cancel'
  lastId: string
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}
export type SettlementPayment = {
  id: string
  month: string
  fromUid: string
  toUid: string
  amount: number
  date: string
  version: number
  canceledAt: unknown | null
  canceledBy: string | null
  createdAt: unknown
  createdBy: string
  updatedAt: unknown
  updatedBy: string
}
export function cleanSharing(
  value: Sharing | null,
  members: string[],
): Sharing | null {
  if (value === null) return null
  if (
    members.length !== 2 ||
    !members.includes(value.payerId) ||
    Object.keys(value.shares).length !== 2 ||
    members.some(
      (uid) =>
        !Number.isInteger(value.shares[uid]) ||
        value.shares[uid]! < 0 ||
        value.shares[uid]! > 100,
    ) ||
    members.reduce((n, uid) => n + value.shares[uid]!, 0) !== 100
  )
    throw new Error('支払者と2人の負担割合（合計100%）を確認してください。')
  return { payerId: value.payerId, shares: { ...value.shares } }
}
export function splitExpense(amount: number, sharing: Sharing) {
  const other = Object.keys(sharing.shares).find(
    (uid) => uid !== sharing.payerId,
  )!
  const otherAmount = Math.floor((amount * sharing.shares[other]!) / 100)
  return { [sharing.payerId]: amount - otherAmount, [other]: otherAmount }
}
export function settlementTotals(
  entries: readonly {
    type: string
    amount: number
    date: string
    sharing?: Sharing | null
  }[],
  ledgers: readonly Pick<SettlementMonth, 'month' | 'netPaid'>[],
  ownerId: string,
  month?: string,
) {
  const paid: Record<string, number> = {},
    burden: Record<string, number> = {}
  for (const e of entries) {
    if (
      e.type !== 'expense' ||
      !e.sharing ||
      (month && e.date.slice(0, 7) !== month)
    )
      continue
    paid[e.sharing.payerId] = (paid[e.sharing.payerId] ?? 0) + e.amount
    for (const [uid, amount] of Object.entries(
      splitExpense(e.amount, e.sharing),
    )) {
      paid[uid] ??= 0
      burden[uid] = (burden[uid] ?? 0) + amount
    }
  }
  const base = (paid[ownerId] ?? 0) - (burden[ownerId] ?? 0)
  const netPaid = Number(
    ledgers
      .filter((l) => !month || l.month === month)
      .reduce((n, l) => n + BigInt(l.netPaid), 0n),
  )
  const remaining = base - netPaid
  if (
    ![
      base,
      netPaid,
      remaining,
      ...Object.values(paid),
      ...Object.values(burden),
    ].every(Number.isSafeInteger)
  )
    throw new Error('集計金額が安全に計算できる範囲を超えました。')
  return { paid, burden, base, netPaid, remaining }
}
export function paymentInput(
  month: string,
  fromUid: string,
  toUid: string,
  amount: number,
  date: string,
  members: string[],
) {
  monthBounds(month)
  if (
    members.length !== 2 ||
    fromUid === toUid ||
    !members.includes(fromUid) ||
    !members.includes(toUid)
  )
    throw new Error('支払う人と受け取る人を確認してください。')
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 9999999999999)
    throw new Error('精算金は1〜9999999999999円の整数で入力してください。')
  const bounds = monthBounds(date.slice(0, 7))
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < bounds.from ||
    date > bounds.through
  )
    throw new Error('実在する支払日を入力してください。')
  return { month, fromUid, toUid, amount, date }
}
