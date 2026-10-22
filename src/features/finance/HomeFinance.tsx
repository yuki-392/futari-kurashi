import { useTokyoDay } from '../tasks/useTokyoDay'
import { useBudgets } from './useBudgets'
import { useFinanceEntries } from './useFinance'
import { budgetBalance, expenseTotals } from './budgetModel'
import { formatYen } from './model'
export function HomeFinance() {
  const month = useTokyoDay().slice(0, 7),
    entries = useFinanceEntries(month, true, 'expense'),
    budgets = useBudgets(month, true, true)
  const failed = entries.status === 'error' || budgets.status === 'error'
  const ready = entries.status === 'ready' && budgets.status === 'ready'
  const expense = expenseTotals(entries.entries).total,
    budget = budgets.budgets[0]
  return (
    <section
      aria-label="今月の家計"
      className="mt-6 rounded-3xl border border-line bg-white p-6 space-y-3"
    >
      <h2 className="text-lg font-bold">
        今月の家計（{month.replace('-', '年')}月）
      </h2>
      {failed ? (
        <p role="alert">
          家計を取得できませんでした。
          <button
            className="task-primary ml-3"
            onClick={() => {
              entries.retry()
              budgets.retry()
            }}
          >
            再試行
          </button>
        </p>
      ) : !ready ? (
        <p role="status">今月の家計を確認しています…</p>
      ) : (
        <>
          <p>
            支出：{formatYen(expense)}
            {!entries.complete ? '（取得範囲）' : ''}
          </p>
          <p>月予算：{budget ? formatYen(budget.amount) : '未設定'}</p>
          {entries.complete ? (
            <p
              className={
                budget && expense > budget.amount
                  ? 'font-bold text-red-800'
                  : 'font-bold text-forest'
              }
            >
              {budgetBalance(budget?.amount ?? null, expense)}
            </p>
          ) : (
            <p role="status">
              支出が取得上限に達したため、正確な残額を表示できません。
            </p>
          )}
        </>
      )}
      <a
        className="inline-flex min-h-11 items-center text-forest underline"
        href="#/finances"
      >
        家計を開く
      </a>
    </section>
  )
}
