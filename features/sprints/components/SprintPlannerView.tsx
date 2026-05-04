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

export default function SprintPlannerView({ columns, onTodoClick, onDragStartCard }: Props) {
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()))

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
        className="flex flex-col rounded-[14px] border bg-white/85 backdrop-blur-md"
        style={{ borderColor: 'var(--ap-border)', minHeight: 520 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'var(--ap-border-soft, var(--ap-border))' }}>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDay((d) => addDays(d, -1))}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDay(startOfDay(new Date()))}
              className="rounded-md px-2 py-1 text-[11px] font-semibold hover:bg-muted"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDay((d) => addDays(d, 1))}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-[12px] font-semibold">{monthLabel}</span>
        </div>

        {/* Day label */}
        <div className="flex items-center justify-center gap-2 px-3 py-3">
          <span className="text-[13px] font-medium text-muted-foreground">{dayLabel}</span>
          <span
            className={cn(
              'inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-[12px] font-semibold',
              isToday(day) ? 'bg-primary-500 text-white' : 'bg-muted text-foreground',
            )}
          >
            {dayNum}
          </span>
        </div>

        <PlannerTimeGrid day={day} todos={allTodos} onTodoClick={onTodoClick} />
      </div>

      {/* Right — compact lanes */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.id}
            className="flex w-[260px] shrink-0 flex-col rounded-[14px] border bg-white/85 p-2 backdrop-blur-md"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[12px] font-semibold">{col.name}</p>
              <span className="text-[11px] tabular-nums text-muted-foreground">{col.todos.length}</span>
            </div>
            <div className="space-y-2">
              {col.todos.map((t) => (
                <TaskCardTrello
                  key={t.id}
                  todo={t}
                  onClick={() => onTodoClick(t.id)}
                  onDragStart={(e) => onDragStartCard?.(e, t.id)}
                />
              ))}
              {col.todos.length === 0 && (
                <p className="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground" style={{ borderColor: 'var(--ap-border-soft, var(--ap-border))' }}>
                  Empty
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
