import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { FinanceForm } from '../finance/FinanceForm'
import { useFinanceCategories } from '../finance/useFinance'
import type { ShoppingItem } from './model'
import { shoppingMessage } from './model'
import { changeShopping } from './service'
import {
  registerShoppingExpense,
  shoppingExpenseCategory,
} from './purchaseService'
export function PurchaseFlow({
  item,
  onClose,
}: {
  item: ShoppingItem
  onClose: () => void
}) {
  const { uid, household } = useHousehold(),
    [expense, setExpense] = useState(item.purchased),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    lock = useRef(false),
    heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    heading.current?.scrollIntoView?.({ block: 'center' })
  }, [])
  return (
    <section
      role="group"
      aria-label="購入と支出の確認"
      className="mt-4 space-y-4 rounded-2xl border border-line bg-sage p-5"
    >
      <h2
        ref={heading}
        tabIndex={-1}
        className="font-bold break-words outline-none"
      >
        「{item.title}」{item.purchased ? 'を支出に登録' : 'の購入'}
      </h2>
      <p className="text-sm">
        予算：
        {item.budget === null
          ? '未設定'
          : `${item.budget.toLocaleString('ja-JP')}円`}
        （参考）。実際に支払った項目全体の金額を入力してください。
      </p>
      <p className="text-sm">
        同じ買い物からの支出登録は1回までです。登録後の編集・削除は家計と買い物で別々に管理し、支出削除後も再登録できません。
      </p>
      {message ? <p role="status">{message}</p> : null}
      {expense ? (
        <PurchaseExpense item={item} onClose={onClose} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            className="task-primary"
            disabled={busy}
            onClick={() => {
              if (lock.current) return
              lock.current = true
              setBusy(true)
              setMessage('')
              void changeShopping(
                household!.id,
                uid,
                item,
                { purchased: true },
                household!.memberIds,
              )
                .then(onClose)
                .catch((e) => setMessage(shoppingMessage(e)))
                .finally(() => {
                  lock.current = false
                  setBusy(false)
                })
            }}
          >
            {busy ? '保存中…' : '購入だけ'}
          </button>
          {!item.expenseId ? (
            <button
              className="task-primary"
              disabled={busy}
              onClick={() => setExpense(true)}
            >
              支出も登録
            </button>
          ) : (
            <p>支出登録済みです。今回は購入状態だけを変更します。</p>
          )}
          <button
            className="rounded-xl border border-line px-4 py-3"
            disabled={busy}
            onClick={onClose}
          >
            キャンセル
          </button>
        </div>
      )}
    </section>
  )
}
function PurchaseExpense({
  item,
  onClose,
}: {
  item: ShoppingItem
  onClose: () => void
}) {
  const { uid, household } = useHousehold(),
    categories = useFinanceCategories()
  // Keep this form mounted during category failures/retries so typed input survives.
  const initialCategory = {
    food: 'expense_food',
    daily: 'expense_daily',
    furniture: 'expense_furniture',
    appliances: 'expense_furniture',
    other: 'expense_other',
  }[item.category]
  const suggested = shoppingExpenseCategory(
    item.category,
    categories.categories,
  )
  return (
    <>
      {categories.status === 'loading' ? (
        <p role="status">家計カテゴリを読み込み中です…</p>
      ) : categories.status === 'error' ? (
        <div>
          <p role="status">
            家計カテゴリを取得できませんでした。入力は保持しています。
          </p>
          <button className="task-primary" onClick={categories.retry}>
            再試行
          </button>
        </div>
      ) : !suggested ? (
        <p>
          対応する標準カテゴリが利用できないため、支出カテゴリを選んでください。
        </p>
      ) : null}
      <FinanceForm
        categories={categories.categories}
        defaults={{ title: item.title, categoryId: initialCategory }}
        expenseOnly
        disabled={categories.status !== 'ready'}
        members={household!.memberIds}
        uid={uid}
        submitLabel={item.purchased ? '支出を登録' : '購入して支出を登録'}
        onCancel={onClose}
        onSave={async (input) => {
          await registerShoppingExpense(household!.id, uid, item, input)
          onClose()
        }}
      />
    </>
  )
}
