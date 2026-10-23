import { useEffect, useRef, useState } from 'react'
import { useHousehold } from '../household/context'
import { useOnline } from '../tasks/useTasks'
import { useTokyoDay } from '../tasks/useTokyoDay'
import { actionLabels, reviewDue, ruleMessage, ruleTime } from './model'
import type { HouseRule, RuleCategory, RuleHistory } from './model'
import {
  changeHouseRule,
  createHouseRule,
  createRuleCategory,
  setRuleCategoryArchived,
} from './service'
import { useRuleData } from './useRuleData'
import { RuleForm } from './RuleForm'
const secondary = 'rounded-xl border border-line px-4 py-3'
export function HouseRulesPanel() {
  const [view, setView] = useState<'rules' | 'categories' | 'history'>('rules'),
    [archived, setArchived] = useState(false),
    [categoryId, setCategoryId] = useState(''),
    [categoryCount, setCategoryCount] = useState(100),
    [history, setHistory] = useState<HouseRule | null>(null)
  const categories = useRuleData<RuleCategory>({
      kind: 'categories',
      count: categoryCount,
    }),
    online = useOnline(),
    heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [view, categories.status])
  if (categories.status !== 'ready' && categories.items.length === 0)
    return (
      <RuleState
        status={categories.status}
        retry={categories.retry}
        online={online}
      />
    )
  return (
    <div className="mt-5 space-y-5">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-xl font-bold outline-none"
      >
        家のルール
      </h2>
      {categories.status === 'error' ? (
        <div>
          <p>カテゴリを再取得できませんでした。入力は保持しています。</p>
          <RuleState status="error" retry={categories.retry} online={online} />
        </div>
      ) : categories.status === 'loading' ? (
        <p role="status">カテゴリを更新中です。入力は保持しています。</p>
      ) : null}
      {!online ? (
        <p role="status">
          オフラインです。通信を戻してから再試行してください。
        </p>
      ) : null}
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="家のルールの表示"
      >
        <button
          role="tab"
          aria-selected={view === 'rules'}
          className={view === 'rules' ? 'task-primary' : secondary}
          onClick={() => {
            setHistory(null)
            setView('rules')
          }}
        >
          ルール一覧
        </button>
        <button
          role="tab"
          aria-selected={view === 'categories'}
          className={view === 'categories' ? 'task-primary' : secondary}
          onClick={() => {
            setHistory(null)
            setView('categories')
          }}
        >
          カテゴリ管理
        </button>
      </div>
      {view === 'categories' ? (
        <RuleCategories
          categories={categories.items}
          blocked={categories.status !== 'ready'}
        />
      ) : view === 'history' && history ? (
        <RuleHistoryPanel
          key={history.id}
          rule={history}
          onClose={() => {
            setHistory(null)
            setView('rules')
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              状態
              <select
                aria-label="状態"
                className="task-input"
                value={archived ? 'retired' : 'current'}
                onChange={(e) => setArchived(e.target.value === 'retired')}
              >
                <option value="current">現行</option>
                <option value="retired">廃止済み</option>
              </select>
            </label>
            <label className="text-sm">
              カテゴリで絞り込み
              <select
                aria-label="カテゴリで絞り込み"
                className="task-input"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">すべてのカテゴリ</option>
                {categories.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.archived ? '（アーカイブ）' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <RuleList
            key={`${archived}:${categoryId}`}
            archived={archived}
            categoryId={categoryId}
            categories={categories.items}
            blocked={categories.status !== 'ready'}
            onHistory={(rule) => {
              setHistory(rule)
              setView('history')
            }}
          />
        </>
      )}
      {categories.more ? (
        <More
          count={categoryCount}
          disabled={categories.status !== 'ready'}
          onMore={() => setCategoryCount((n) => n + 100)}
          label="カテゴリをさらに100件表示"
        />
      ) : null}
    </div>
  )
}
function RuleList({
  archived,
  categoryId,
  categories,
  onHistory,
  blocked = false,
}: {
  archived: boolean
  categoryId: string
  categories: RuleCategory[]
  onHistory: (r: HouseRule) => void
  blocked?: boolean
}) {
  const { uid, household } = useHousehold(),
    today = useTokyoDay(),
    online = useOnline()
  const [count, setCount] = useState(100),
    [editing, setEditing] = useState<HouseRule | null>(null),
    [retiring, setRetiring] = useState<HouseRule | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    lock = useRef(false)
  const data = useRuleData<HouseRule>({
    kind: 'rules',
    count,
    archived,
    categoryId,
  })
  async function action(
    rule: HouseRule,
    kind: 'agree' | 'withdraw' | 'retire',
  ) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      await changeHouseRule(household!.id, uid, rule, kind)
      setRetiring(null)
      setMessage(`${actionLabels[kind]}を記録しました。`)
    } catch (e) {
      setMessage(ruleMessage(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      {message ? (
        <p role="status" className="rounded-xl bg-sage p-4">
          {message}
        </p>
      ) : null}
      {editing ? (
        <RuleForm
          key={editing.id}
          entry={editing}
          restoring={editing.archived}
          categories={categories}
          disabled={blocked}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            await changeHouseRule(
              household!.id,
              uid,
              editing,
              editing.archived ? 'restore' : 'edit',
              input,
            )
            setEditing(null)
            setMessage(
              editing.archived
                ? 'ルールを再開しました。2人とも再合意してください。'
                : 'ルールを更新しました。2人とも再合意してください。',
            )
          }}
        />
      ) : !archived ? (
        <RuleForm
          categories={categories}
          disabled={blocked}
          onSave={(input) => createHouseRule(household!.id, uid, input)}
        />
      ) : null}
      {data.status !== 'ready' ? (
        <RuleState status={data.status} retry={data.retry} online={online} />
      ) : !data.items.length ? (
        <p>
          {archived
            ? '廃止済みのルールはありません。'
            : 'この条件のルールはありません。'}
        </p>
      ) : (
        data.items.map((rule) => (
          <article
            aria-label={rule.title}
            key={rule.id}
            className="space-y-3 rounded-2xl border border-line bg-white p-5"
          >
            <h3 className="break-words font-bold">{rule.title}</h3>
            <p className="whitespace-pre-wrap break-words">{rule.body}</p>
            <p className="text-sm text-muted">
              {rule.categoryName} · 内容の版 {rule.contentVersion} · 更新者：
              {rule.updatedBy === uid ? '自分' : '相手'}（
              {ruleTime(rule.updatedAt)}）
            </p>
            <p className="text-sm">
              {rule.reviewDate
                ? `見直し日：${rule.reviewDate}`
                : '見直し日：未設定'}
              {!archived && reviewDue(rule.reviewDate, today) ? (
                <strong className="ml-2 text-forest">見直し時期</strong>
              ) : null}
            </p>
            <Agreement rule={rule} />
            <div className="flex flex-wrap gap-2">
              {archived ? (
                <button
                  className={secondary}
                  disabled={!online || busy || blocked}
                  onClick={() => setEditing(rule)}
                >
                  内容を確認して再開
                </button>
              ) : (
                <>
                  <button
                    className="task-primary"
                    disabled={!online || busy || blocked}
                    onClick={() =>
                      void action(
                        rule,
                        rule.agreedUids.includes(uid) ? 'withdraw' : 'agree',
                      )
                    }
                  >
                    {busy
                      ? '処理中…'
                      : rule.agreedUids.includes(uid)
                        ? '自分の合意を取り消す'
                        : 'この内容に合意する'}
                  </button>
                  <button
                    className={secondary}
                    disabled={busy}
                    onClick={() => {
                      setEditing(rule)
                      setMessage('')
                    }}
                  >
                    編集
                  </button>
                  <button
                    className={secondary}
                    disabled={!online || busy || blocked}
                    onClick={() => setRetiring(rule)}
                  >
                    廃止
                  </button>
                </>
              )}
              <button className={secondary} onClick={() => onHistory(rule)}>
                履歴
              </button>
            </div>
          </article>
        ))
      )}
      {retiring ? (
        <section
          aria-label="廃止の確認"
          className="space-y-3 rounded-2xl bg-sage p-5"
        >
          <p>
            「{retiring.title}
            」を廃止しますか？履歴は保持し、後から再開できます。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="task-primary"
              disabled={!online || busy || blocked}
              onClick={() => void action(retiring, 'retire')}
            >
              廃止を確定する
            </button>
            <button
              className={secondary}
              disabled={busy}
              onClick={() => setRetiring(null)}
            >
              キャンセル
            </button>
          </div>
        </section>
      ) : null}
      {data.more ? (
        <More count={count} onMore={() => setCount((n) => n + 100)} />
      ) : null}
    </div>
  )
}
function Agreement({ rule }: { rule: Pick<HouseRule, 'agreedUids'> }) {
  const { uid, household } = useHousehold(),
    partner = household?.memberIds.find((id) => id !== uid)
  return (
    <div className="text-sm">
      <p>
        自分：{rule.agreedUids.includes(uid) ? '合意済み' : '未合意'} · 相手：
        {partner
          ? rule.agreedUids.includes(partner)
            ? '合意済み'
            : '未合意'
          : '参加待ち'}
      </p>
      {partner && rule.agreedUids.length === 2 ? (
        <p className="font-semibold text-forest">2人とも合意済み</p>
      ) : !partner ? (
        <p>相手の参加待ち</p>
      ) : null}
    </div>
  )
}
function RuleHistoryPanel({
  rule,
  onClose,
}: {
  rule: HouseRule
  onClose: () => void
}) {
  const [count, setCount] = useState(100),
    data = useRuleData<RuleHistory>({
      kind: 'history',
      ruleId: rule.id,
      count,
    }),
    { uid } = useHousehold(),
    online = useOnline()
  return (
    <section className="space-y-4">
      <h3 className="font-bold">「{rule.title}」の変更履歴</h3>
      <button className={secondary} onClick={onClose}>
        一覧へ戻る
      </button>
      {data.status !== 'ready' ? (
        <RuleState status={data.status} retry={data.retry} online={online} />
      ) : (
        data.items.map(({ id, snapshot: r }) => (
          <article key={id} className="space-y-2 rounded-2xl bg-white p-5">
            <h4 className="font-bold">
              {actionLabels[r.lastAction]} · 操作の版 {r.version}
            </h4>
            <p className="text-sm">
              記録者：{r.updatedBy === uid ? '自分' : '相手'} ·{' '}
              {ruleTime(r.updatedAt)}
            </p>
            <p className="break-words font-semibold">{r.title}</p>
            <p className="whitespace-pre-wrap break-words">{r.body}</p>
            <p className="text-sm">
              {r.categoryName} · 見直し日：{r.reviewDate ?? '未設定'} · 内容の版{' '}
              {r.contentVersion} · {r.archived ? '廃止済み' : '現行'}
            </p>
            <p className="text-sm">
              記録時の合意者：
              {r.agreedUids.length
                ? r.agreedUids
                    .map((id) => (id === uid ? '自分' : '相手'))
                    .join('・')
                : 'なし'}
            </p>
          </article>
        ))
      )}
      {data.status === 'ready' && !data.items.length ? (
        <p>履歴はありません。</p>
      ) : null}
      {data.more ? (
        <More
          count={count}
          disabled={data.status !== 'ready'}
          onMore={() => setCount((n) => n + 100)}
          label="履歴をさらに100件表示"
        />
      ) : null}
    </section>
  )
}
function RuleCategories({
  categories,
  blocked = false,
}: {
  categories: RuleCategory[]
  blocked?: boolean
}) {
  const { uid, household } = useHousehold(),
    online = useOnline(),
    [name, setName] = useState(''),
    [confirm, setConfirm] = useState<RuleCategory | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    lock = useRef(false)
  async function run(fn: () => Promise<void>, done: string) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      await fn()
      setConfirm(null)
      setMessage(done)
    } catch (e) {
      setMessage(ruleMessage(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4" aria-label="ルールのカテゴリ管理">
      <h3 className="font-bold">ルールのカテゴリ管理</h3>
      {message ? <p role="status">{message}</p> : null}
      <form
        className="space-y-3 rounded-2xl bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void run(async () => {
            await createRuleCategory(household!.id, uid, name)
            setName('')
          }, 'カテゴリを追加しました。')
        }}
      >
        <label className="block">
          追加するカテゴリ名
          <input
            className="task-input"
            maxLength={80}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="task-primary" disabled={!online || busy || blocked}>
          カテゴリを追加する
        </button>
      </form>
      {categories.map((c) => (
        <article
          key={c.id}
          aria-label={c.name}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4"
        >
          <p className="min-w-0 break-words">
            {c.name}
            {c.archived ? '（アーカイブ）' : ''}
          </p>
          <button
            className={secondary}
            disabled={!online || busy || blocked}
            onClick={() =>
              c.archived
                ? void run(
                    () => setRuleCategoryArchived(household!.id, uid, c, false),
                    'カテゴリを再利用しました。',
                  )
                : setConfirm(c)
            }
          >
            {c.archived ? '再利用' : '削除'}
          </button>
        </article>
      ))}
      {confirm ? (
        <section
          className="space-y-3 rounded-2xl bg-sage p-5"
          aria-label="カテゴリ削除の確認"
        >
          <p>
            「{confirm.name}
            」を新規選択から外しますか？既存ルールの分類・合意と履歴は保持します。
          </p>
          <button
            className="task-primary"
            disabled={!online || busy || blocked}
            onClick={() =>
              void run(
                () =>
                  setRuleCategoryArchived(household!.id, uid, confirm, true),
                'カテゴリをアーカイブしました。',
              )
            }
          >
            アーカイブする
          </button>
          <button
            className={`${secondary} ml-2`}
            disabled={busy}
            onClick={() => setConfirm(null)}
          >
            キャンセル
          </button>
        </section>
      ) : null}
    </section>
  )
}
function RuleState({
  status,
  retry,
  online,
}: {
  status: 'loading' | 'ready' | 'error'
  retry: () => void
  online: boolean
}) {
  return status === 'error' ? (
    <div>
      <p role="status">
        ルールを取得できませんでした。通信を確認してください。
      </p>
      <button className="task-primary" onClick={retry}>
        再試行
      </button>
    </div>
  ) : (
    <p role="status">
      {online
        ? '家のルールを読み込み中です…'
        : 'オフラインです。通信を戻して再試行してください。'}
    </p>
  )
}
function More({
  count,
  onMore,
  label = 'さらに100件表示',
  disabled = false,
}: {
  count: number
  onMore: () => void
  label?: string
  disabled?: boolean
}) {
  return count < 10000 ? (
    <button className={secondary} disabled={disabled} onClick={onMore}>
      {label}
    </button>
  ) : (
    <p role="status">
      取得した10,000件までを表示しています。上限を超える総件数は表示していません。
    </p>
  )
}
