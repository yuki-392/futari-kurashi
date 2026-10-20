import { TodayRecurring } from '../recurring-tasks/RecurringPanels'
import { TodayTasks } from '../tasks/TodayTasks'
import { pages } from '../../app/navigation'
import { useHousehold } from '../household/context'

export function HomePanel() {
  const { household, uid } = useHousehold()
  if (!household) return null
  return (
    <>
      <section className="rounded-3xl bg-sage p-6" aria-label="ふたりの世帯">
        <p className="text-xs font-semibold tracking-wider text-forest">
          ふたりの世帯
        </p>
        <h2 className="mt-3 break-words text-2xl font-bold">
          {household.name}
        </h2>
        <p className="mt-4 font-medium">
          参加人数：{household.memberIds.length} / 2人
        </p>
        <p className="mt-2 text-sm leading-7">
          自分：参加済み · パートナー：
          {household.memberIds.length === 2 ? '参加済み' : '参加待ち'}
        </p>
        {household.memberIds.length === 1 ? (
          <a
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-forest px-4 py-3 text-sm font-medium text-white"
            href="#/settings"
          >
            {household.ownerId === uid
              ? 'パートナーを招待する'
              : '世帯の設定を確認する'}
          </a>
        ) : null}
      </section>
      <TodayTasks />
      <TodayRecurring />
      <section className="mt-8" aria-labelledby="home-features">
        <h2 id="home-features" className="text-lg font-bold">
          暮らしを整える
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted">
          家事はToDoで管理できます。買い物や片付けも順番に追加します。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {pages.slice(1).map((page) => (
            <a
              key={page.id}
              href={`#/${page.id}`}
              className="rounded-2xl border border-line bg-white p-5"
            >
              <span className="font-semibold">{page.label}</span>
              <span className="mt-2 block text-xs text-muted">
                {page.id === 'settings'
                  ? 'アカウント・世帯'
                  : page.id === 'chores'
                    ? 'ToDoを管理'
                    : page.id === 'finances'
                      ? 'Phase 2で追加予定'
                      : '準備中'}
              </span>
            </a>
          ))}
        </div>
      </section>
    </>
  )
}
