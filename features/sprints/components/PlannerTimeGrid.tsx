'use client'

/**
 * PlannerTimeGrid — pure presentational day calendar for the per-sprint
 * Planner view. Renders an hour grid for the picked day and positions todos
 * by their `startTime` / `endTime` (HH:mm strings). Todos that match the
 * date but have no times render as all-day chips above the grid.
 */

import { useMemo } from 'react'
import { todoStatusMeta } from '@/lib/todo-status'

export interface PlannerTodo {
  id: string
  title: string
  status: string
  priority: string
  startDate: string | null
  dueDate: string | null
  startTime: string | null
  endTime: string | null
}

interface Props {
  /** Day to display (local-tz, midnight). */
  day: Date
  todos: PlannerTodo[]
  onTodoClick: (id: string) => void
  /** Hour to start the grid on (default 7). */
  startHour?: number
  /** Hour to end the grid on, exclusive (default 21). */
  endHour?: number
  /** Dark board ground (`graphite`) — hour rules and labels have to invert. */
  dark?: boolean
}

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function parseHHMM(s: string | null): number | null {
  if (!s) return null
  const m = /^(\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/**
 * Block tone comes from the canonical status map (lib/todo-status), not a
 * second copy of the palette — that map is the one place STUCK's hue is
 * decided, and it already reads the --ap-* tokens.
 */
function statusToTone(status: string): React.CSSProperties {
  const meta = todoStatusMeta(status)
  return { background: meta.bg, borderColor: meta.dot, color: meta.fg }
}

export default function PlannerTimeGrid({ day, todos, onTodoClick, startHour = 7, endHour = 21, dark }: Props) {
  const hours = endHour - startHour

  /** Hairlines and secondary ink both have to invert on a dark ground. */
  const ruleColor = dark ? 'oklch(1 0 0 / 0.14)' : 'var(--ap-border)'
  const subtleInk = dark ? 'oklch(0.88 0.006 262)' : 'var(--ap-fg-subtle)'

  /** Pixels per hour — drives both the grid row height and todo block sizing. */
  const HOUR_PX = 56

  /** Todos belonging to this day (by startDate or dueDate). */
  const dayTodos = useMemo(() => {
    return todos.filter((t) => {
      const refStr = t.startDate ?? t.dueDate
      if (!refStr) return false
      const ref = new Date(refStr)
      return sameLocalDay(ref, day)
    })
  }, [todos, day])

  const allDay = dayTodos.filter((t) => !(t.startTime && t.endTime))
  const timed = dayTodos.filter((t) => t.startTime && t.endTime)

  // Now indicator
  const now = new Date()
  const showNowLine = sameLocalDay(now, day)
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const nowTop = ((nowMins - startHour * 60) / 60) * HOUR_PX

  return (
    <div className="flex h-full flex-col">
      {/* All-day strip */}
      {allDay.length > 0 && (
        <div className="border-b px-3 py-2" style={{ borderColor: ruleColor }}>
          <p className="mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.1em]" style={{ color: subtleInk }}>All day</p>
          <div className="flex flex-wrap gap-1.5">
            {allDay.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTodoClick(t.id)}
                className="inline-flex h-[21px] max-w-full items-center truncate rounded-[var(--ap-radius-xs)] border px-[7px] text-[11px] font-semibold transition hover:brightness-95"
                style={statusToTone(t.status)}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hour grid */}
      <div className="relative flex-1 overflow-y-auto">
        <div className="relative" style={{ height: hours * HOUR_PX }}>
          {/* Hour rows */}
          {Array.from({ length: hours + 1 }).map((_, i) => {
            const h = startHour + i
            const top = i * HOUR_PX
            const label = h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`
            return (
              <div
                key={i}
                className="absolute inset-x-0 flex items-start"
                style={{ top, height: HOUR_PX }}
              >
                <span
                  className="w-12 shrink-0 -translate-y-1/2 pl-2 font-mono text-[10px] tabular-nums"
                  style={{ color: subtleInk }}
                >
                  {i < hours ? label : ''}
                </span>
                <span className="flex-1 self-start" style={{ borderTop: `1px solid ${ruleColor}` }} />
              </div>
            )
          })}

          {/* Now line */}
          {showNowLine && nowTop >= 0 && nowTop <= hours * HOUR_PX && (
            <div
              className="pointer-events-none absolute left-12 right-2 z-10 flex items-center"
              style={{ top: nowTop }}
            >
              <span className="h-2 w-2 -translate-x-1 rounded-full" style={{ background: 'var(--ap-danger)' }} />
              <span className="h-px flex-1" style={{ background: 'var(--ap-danger)' }} />
            </div>
          )}

          {/* Timed blocks */}
          {timed.map((t) => {
            const start = parseHHMM(t.startTime)!
            const end = parseHHMM(t.endTime)!
            const top = ((start - startHour * 60) / 60) * HOUR_PX
            const height = Math.max(20, ((end - start) / 60) * HOUR_PX)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTodoClick(t.id)}
                className="absolute left-12 right-2 overflow-hidden rounded-[var(--ap-radius-xs)] border px-2 py-1 text-left text-[11px] font-medium shadow-[var(--ap-shadow-sm)] transition hover:brightness-95"
                style={{ ...statusToTone(t.status), top, height }}
                title={`${t.startTime}–${t.endTime} ${t.title}`}
              >
                <p className="truncate">{t.title}</p>
                <p className="text-[9px] opacity-70">{t.startTime}–{t.endTime}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
