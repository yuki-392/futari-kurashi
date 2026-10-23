import { useState } from 'react'
import { useHousehold } from '../household/context'
import { useOnline } from '../tasks/useTasks'
import { categories } from './model'
import type { ShoppingItem, ShoppingInput } from './model'
import { ShoppingForm } from './ShoppingForm'
import { ShoppingList } from './ShoppingList'
import { PurchaseFlow } from './PurchaseFlow'
import { useShopping } from './useShopping'
import { createShopping, changeShopping } from './service'
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
    <p role="status">買い物を読み込み中です…</p>
  ) : status === 'error' ? (
    <>
      <p role="status">
        買い物を取得できませんでした。通信を確認してください。
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
export function ShoppingPanel() {
  const { uid, household } = useHousehold()
  const [purchased, setPurchased] = useState(false),
    [category, setCategory] = useState<ShoppingInput['category'] | ''>(''),
    [editing, setEditing] = useState<ShoppingItem | null>(null),
    [purchase, setPurchase] = useState<ShoppingItem | null>(null)
  return (
    <div className="space-y-6">
      <Offline />
      {purchase ? (
        <PurchaseFlow
          key={purchase.id}
          item={purchase}
          onClose={() => setPurchase(null)}
        />
      ) : null}
      <ShoppingForm
        key={editing ? `${editing.id}:${editing.version}` : 'new'}
        item={editing ?? undefined}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSave={async (input) => {
          if (editing) {
            await changeShopping(
              household!.id,
              uid,
              editing,
              input,
              household!.memberIds,
            )
            setEditing((current) => (current === editing ? null : current))
          } else
            await createShopping(
              household!.id,
              uid,
              input,
              household!.memberIds,
            )
        }}
      />
      <section aria-label="買い物一覧">
        <div className="mb-4 flex gap-3">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              className={
                value === purchased
                  ? 'task-primary'
                  : 'rounded-xl border border-line bg-white px-4 py-3'
              }
              aria-pressed={purchased === value}
              onClick={() => {
                setPurchased(value)
                setEditing(null)
                setPurchase(null)
              }}
            >
              {value ? '購入済み' : '未購入'}
            </button>
          ))}
        </div>
        <label className="block text-sm mb-5">
          カテゴリで絞り込み
          <select
            className="task-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            <option value="">すべて</option>
            {Object.entries(categories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <ShoppingRecords
          key={`${purchased}:${category}`}
          purchased={purchased}
          category={category}
          onPurchase={(item) => {
            setEditing(null)
            setPurchase(item)
          }}
          onEdit={(item) => {
            setPurchase(null)
            setEditing(item)
            window.scrollTo(0, 0)
          }}
        />
      </section>
    </div>
  )
}
function ShoppingRecords({
  purchased,
  category,
  onEdit,
  onPurchase,
}: {
  purchased: boolean
  category: ShoppingInput['category'] | ''
  onEdit: (item: ShoppingItem) => void
  onPurchase: (item: ShoppingItem) => void
}) {
  const [count, setCount] = useState(100),
    list = useShopping({ purchased, count, ...(category ? { category } : {}) })
  return (
    <ListState status={list.status} retry={list.retry}>
      {list.items.length ? (
        <ShoppingList
          tasks={list.items}
          onEdit={onEdit}
          onPurchase={onPurchase}
        />
      ) : (
        <p>
          {purchased
            ? '購入済みの商品はありません。'
            : '未購入の商品はありません。'}
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
export function HomeShopping() {
  const [purchase, setPurchase] = useState<ShoppingItem | null>(null)
  const list = useShopping({ purchased: false, count: 5 })
  return (
    <section className="mt-8" aria-labelledby="home-shopping-title">
      <h2 id="home-shopping-title" className="mb-4 text-lg font-bold">
        未購入の買い物
      </h2>
      <Offline />
      {purchase ? (
        <PurchaseFlow
          key={purchase.id}
          item={purchase}
          onClose={() => setPurchase(null)}
        />
      ) : null}
      <ListState status={list.status} retry={list.retry}>
        {list.items.length ? (
          <ShoppingList tasks={list.items} onPurchase={setPurchase} />
        ) : (
          <p className="rounded-2xl bg-white p-5 text-sm">
            未購入の商品はありません。
          </p>
        )}
        {list.more ? <p className="mt-3 text-sm">ほかにもあります</p> : null}
      </ListState>
      <a
        className="mt-3 inline-flex min-h-11 items-center text-forest underline"
        href="#/shopping"
      >
        買い物リストを開く
      </a>
    </section>
  )
}
