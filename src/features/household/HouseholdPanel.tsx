import { useEffect, useRef, useState } from 'react'
import { useHousehold } from './context'
import {
  displayCode,
  householdMessage,
  normalizeCode,
  normalizeEmail,
  validateName,
} from './model'
import type { Invitation } from './model'
import { validateEmail } from '../auth/validation'
export function HouseholdPanel() {
  const home = useHousehold()
  const [name, setName] = useState('ふたりの暮らし'),
    [email, setEmail] = useState(''),
    [code, setCode] = useState('')
  const [preview, setPreview] = useState<Invitation | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const lock = useRef(false),
    feedback = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (message) feedback.current?.focus()
  }, [message])
  async function run(action: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setPreview(null)
      setMessage(householdMessage(error))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const button = 'rounded-xl bg-forest px-5 py-3 text-white disabled:opacity-50'
  const input =
    'mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-base'
  if (home.status === 'loading')
    return <p role="status">世帯情報を確認中です…</p>
  if (home.status === 'error')
    return (
      <div>
        <p role="status">
          世帯情報を取得できませんでした。通信を確認してください。
        </p>
        <button className={button} onClick={home.retry}>
          世帯情報を再取得
        </button>
      </div>
    )
  return (
    <section className="mt-5 space-y-5" aria-label="世帯の設定">
      {home.household ? (
        <>
          <h3 className="break-words text-xl font-bold">
            {home.household.name}
          </h3>
          <p>参加人数：{home.household.memberIds.length} / 2人</p>
          <p>
            自分：参加済み · パートナー：
            {home.household.memberIds.length === 2 ? '参加済み' : '参加待ち'}
          </p>
          {home.household.ownerId === home.uid &&
          home.household.memberIds.length === 1 ? (
            <>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  const target = normalizeEmail(
                    String(data.get('targetEmail') ?? ''),
                  )
                  const invalid = validateEmail(target)
                  if (invalid || target === normalizeEmail(home.email)) {
                    setMessage(
                      invalid || '相手のメールアドレスを指定してください。',
                    )
                    return
                  }
                  void run(async () => {
                    await home.issue(target)
                    setMessage(
                      '招待コードを発行しました。相手にコピーして渡してください。',
                    )
                  })
                }}
              >
                <fieldset disabled={busy} className="space-y-3">
                  <label className="block text-sm">
                    相手のメールアドレス
                    <input
                      className={input}
                      name="targetEmail"
                      type="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <button className={button} type="submit">
                    {busy
                      ? '処理中…'
                      : home.household.activeInviteId
                        ? '招待コードを再発行'
                        : '招待コードを発行'}
                  </button>
                </fieldset>
              </form>
              {home.household.activeInviteId ? (
                <div className="space-y-3 rounded-xl bg-sage p-4">
                  <p>招待コード（発行から24時間・1回限り）</p>
                  <output
                    aria-label="発行した招待コード"
                    className="block break-all font-mono"
                  >
                    {displayCode(home.household.activeInviteId)}
                  </output>
                  <p className="text-sm">
                    指定したメールを確認済みの相手だけが参加できます。再発行すると旧コードは無効になります。
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      disabled={busy}
                      className={button}
                      onClick={() =>
                        void run(async () => {
                          await navigator.clipboard.writeText(
                            displayCode(home.household!.activeInviteId!),
                          )
                          setMessage('招待コードをコピーしました。')
                        })
                      }
                    >
                      コードをコピー
                    </button>
                    <button
                      disabled={busy}
                      className="px-3 py-3 underline"
                      onClick={() =>
                        void run(async () => {
                          await home.cancel()
                          setMessage('招待を取り消しました。')
                        })
                      }
                    >
                      招待を取り消す
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <>
          <h3 className="text-lg font-bold">ふたりの世帯を設定</h3>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              const value = String(
                new FormData(event.currentTarget).get('householdName') ?? '',
              )
              const invalid = validateName(value)
              if (invalid) {
                setMessage(invalid)
                return
              }
              void run(() => home.create(value))
            }}
          >
            <fieldset disabled={busy} className="space-y-3">
              <label className="block text-sm">
                世帯名
                <input
                  className={input}
                  name="householdName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className={button} type="submit">
                {busy ? '処理中…' : '世帯を作る'}
              </button>
            </fieldset>
          </form>
          <div className="border-t border-line pt-5">
            <h3 className="mb-3 text-lg font-bold">招待コードで参加する</h3>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                const value = normalizeCode(
                  String(
                    new FormData(event.currentTarget).get('inviteCode') ?? '',
                  ),
                )
                void run(async () => setPreview(await home.inspect(value)))
              }}
            >
              <fieldset disabled={busy} className="space-y-3">
                <label className="block text-sm">
                  招待コード
                  <input
                    className={input}
                    name="inviteCode"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value)
                      setPreview(null)
                    }}
                  />
                </label>
                <button className={button} type="submit">
                  {busy ? '処理中…' : '招待を確認する'}
                </button>
              </fieldset>
            </form>
          </div>
          {preview ? (
            <div className="space-y-3 rounded-xl bg-sage p-4">
              <p className="break-words">
                {preview.householdName}に参加しますか？
              </p>
              <button
                disabled={busy}
                className={button}
                onClick={() => void run(() => home.join(preview.code))}
              >
                参加する
              </button>
            </div>
          ) : null}
        </>
      )}
      {message ? (
        <p
          role="status"
          tabIndex={-1}
          ref={feedback}
          className="rounded-xl bg-sage p-4 text-sm leading-7"
        >
          {message}
        </p>
      ) : null}
    </section>
  )
}
