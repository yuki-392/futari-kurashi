import { CleaningPanel } from '../cleaning/CleaningPanel'
import { useState } from 'react'
import { TasksPanel } from '../tasks/TasksPanel'
import { RecurringPanel, HistoryPanel } from './RecurringPanels'
export function ChoresPanel() {
  const [section, setSection] = useState<
    'todo' | 'recurring' | 'cleaning' | 'history'
  >('todo')
  return (
    <>
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="group"
        aria-label="家事の表示"
      >
        {(
          [
            ['todo', 'ToDo'],
            ['recurring', '繰り返し'],
            ['cleaning', '掃除'],
            ['history', '履歴'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={
              id === section
                ? 'task-primary'
                : 'rounded-xl border border-line bg-white px-4 py-3'
            }
            aria-pressed={id === section}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {section === 'todo' ? (
        <TasksPanel />
      ) : section === 'recurring' ? (
        <RecurringPanel />
      ) : section === 'cleaning' ? (
        <CleaningPanel />
      ) : (
        <HistoryPanel />
      )}
    </>
  )
}
