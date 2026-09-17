'use client'

/**
 * SprintPlannerView — left = day calendar (PlannerTimeGrid), right = the
 * same kanban columns rendered in compact form. Mounted by SprintBoardClient
 * when `view === 'planner'`. Reads the same query data the board uses.
 */

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlannerTimeGrid, { type PlannerTodo } from './PlannerTimeGrid'
import TaskCardTrello, { type TrelloTodo } from './TaskCardTrello'

interface ColumnLite {
  id: string
  name: string
  status: string
  todos: TrelloTodo[]
}

interface Props {
  columns: ColumnLite[]
  onTodoClick: (id: string) => void
  onDragStartCard?: (e: React.DragEvent, todoId: string) => void
  /** Dark board ground (`graphite`). Forks both panes and the cards inside. */
  dark?: boolean
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function isToday(d: Date) {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

export default function SprintPlannerView({ columns, onTodoClick, onDragStartCard, dark }: Props) {
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()))

  // Both panes are lanes as far as the eye is concerned, so they take the
  // board's own lane treatment rather than Tailwind's `border`
  // (shadcn hsl(var(--border))), which does not follow the --ap-* retarget.
  const paneStyle = {
    background: dark ? 'oklch(0.28 0.02 262 / 0.62)' : 'oklch(1 0 0 / 0.72)',
    borderColor: dark ? 'oklch(1 0 0 / 0.14)' : 'oklch(1 0 0 / 0.8)',
    boxShadow: 'var(--ap-shadow-sm)',
  } as const

  const allTodos: PlannerTodo[] = columns.flatMap((c) =>
    c.todos.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      startDate: t.startDate ?? null,
      dueDate: t.dueDate,
      startTime: t.startTime ?? null,
      endTime: t.endTime ?? null,
    })),
  )

  const monthLabel = day.toLocaleDateString('en-US', { month: 'long' })
  const dayLabel = day.toLocaleDateString('en-US', { weekday: 'long' })
  const dayNum = day.getDate()

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[340px_1fr]">
      {/* Left — calendar pane */}
      <div
        className={cn(
          'flex flex-col rounded-[var(--ap-radius-card)] border backdrop-blur-md',
          dark && 'text-white',
        )}
        style={{ ...paneStyle, minHeight: 520 }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: dark ? 'oklch(1 0 0 / 0.14)' : 'var(--ap-border)' }}
        >
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDay((d) => addDays(d, -1))}
              className={cn('rounded-[var(--ap-radius-xs)] p-1', dark ? 'hover:bg-white/15' : 'hover:bg-[var(--ap-bg-hover)]')}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDay(startOfDay(new Date()))}
              className={cn('rounded-[var(--ap-radius-xs)] px-2 py-1 text-[11px] font-semibold', dark ? 'hover:bg-white/15' : 'hover:bg-[var(--ap-bg-hover)]')}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDay((d) => addDays(d, 1))}
              className={cn('rounded-[var(--ap-radius-xs)] p-1', dark ? 'hover:bg-white/15' : 'hover:bg-[var(--ap-bg-hover)]')}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-[12px] font-semibold">{monthLabel}</span>
        </div>

        {/* Day label */}
        <div className="flex items-center justify-center gap-2 px-3 py-3">
          <span
            className="text-[13px] font-medium"
            style={{ color: dark ? 'oklch(0.9 0.006 262)' : 'var(--ap-fg-secondary)' }}
          >
            {dayLabel}
          </span>
          <span
            className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-[var(--ap-radius-pill)] px-2 text-[12px] font-semibold"
            style={
              isToday(day)
                ? { background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }
                : dark
                  ? { background: 'oklch(1 0 0 / 0.16)', color: 'oklch(1 0 0)' }
                  : { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg)' }
            }
          >
            {dayNum}
          </span>
        </div>

        <PlannerTimeGrid day={day} todos={allTodos} onTodoClick={onTodoClick} dark={dark} />
      </div>

      {/* Right — compact lanes */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            className={cn(
              'flex w-[286px] shrink-0 flex-col gap-2 rounded-[var(--ap-radius-card)] border p-[10px] backdrop-blur-md',
              dark && 'text-white',
            )}
            style={paneStyle}
          >
            <div className="flex items-center gap-2 px-[2px] pt-[2px]">
              <span className="text-[13.5px] font-bold tracking-[-0.01em]">{col.name}</span>
              <span
                className="rounded-[5px] px-1.5 py-px font-mono text-[10.5px] tabular-nums"
                style={
                  dark
                    ? { background: 'oklch(1 0 0 / 0.16)', color: 'oklch(1 0 0)' }
                    : { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-secondary)' }
                }
              >
                {col.todos.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {col.todos.map((t) => (
                <TaskCardTrello
                  key={t.id}
                  todo={t}
                  dark={dark}
                  onClick={() => onTodoClick(t.id)}
                  onDragStart={(e) => onDragStartCard?.(e, t.id)}
                />
              ))}
              {col.todos.length === 0 && (
                <p
                  className="rounded-[10px] border border-dashed px-3 py-[18px] text-center text-[12.5px] leading-[1.5]"
                  style={{
                    borderColor: dark ? 'oklch(1 0 0 / 0.28)' : 'oklch(0.86 0.01 262)',
                    color: dark ? 'oklch(0.88 0.006 262)' : 'var(--ap-fg-subtle)',
                  }}
                >
                  Nothing here yet.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
