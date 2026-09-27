'use client'

/**
 * Trello-style dates panel (start/due, times, recurrence, reminder) opened from
 * the card modal's attribute grid and rail. Split out of TodoCardModal.tsx;
 * behaviour unchanged.
 */

import { useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DUE_REMINDERS } from '@/lib/todos/due-reminders'
import { RECURRENCE_RULES } from '@/lib/todos/recurrence'
import { WEEKDAYS, MONTHS, ymd, parseYmd, sameDay, inRange, fmtMd, to12h } from './cardDateUtils'

export interface DatesPanelProps {
  startDate: string | null
  dueDate: string | null
  startTime: string | null
  endTime: string | null
  dueReminder: string | null
  recurrenceRule: string | null
  recurrenceEndsAt: string | null
  /** Sprint window, used only for the non-blocking out-of-range warning (DTE-7). */
  sprintWindow?: { name: string; startDate: string | null; endDate: string | null } | null
  onSave: (v: {
    startDate: string | null; dueDate: string | null
    startTime: string | null; endTime: string | null
    dueReminder: string | null
    recurrenceRule: string | null
    recurrenceEndsAt: string | null
  }) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * Times offered by the date rows. A bare `<input type="time">` shows "--:-- --"
 * until it is touched, gives no hint of the expected format, and on most
 * browsers needs three separate keystroke groups to fill. A half-hour list is
 * what people actually pick, and "All day" is a real answer rather than an
 * empty field.
 */
const TIME_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All day' },
  ...Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2)
    const m = i % 2 ? '30' : '00'
    const value = `${String(h).padStart(2, '0')}:${m}`
    const h12 = h % 12 === 0 ? 12 : h % 12
    return { value, label: `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}` }
  }),
]

/**
 * One date row: a checkbox to turn the date on, a label, and a readable summary
 * of what is currently set. Clicking the row makes it the target for the next
 * day picked on the calendar — so the calendar is the input and there is
 * nothing to type.
 */
function DateRow({
  label, enabled, onEnabledChange, active, onActivate,
  dateStr, time, onTimeChange, onClear,
}: {
  label: string
  enabled: boolean
  onEnabledChange: (v: boolean) => void
  active: boolean
  onActivate: () => void
  dateStr: string | null
  time: string
  onTimeChange: (v: string) => void
  onClear: () => void
}) {
  const summary = dateStr
    ? `${fmtMd(dateStr)}${time ? ` · ${to12h(time)}` : ''}`
    : '— —'
  return (
    <div
      className={cn(
        'rounded-[var(--ap-radius-sm)] border px-2.5 py-2 transition-colors',
        active
          ? 'border-[1.5px] border-[var(--ap-focus)] bg-[var(--ap-accent-soft)]'
          : 'border-[var(--ap-border)] hover:bg-[var(--ap-bg-hover)]',
        enabled ? 'cursor-pointer' : 'cursor-pointer opacity-70',
      )}
      onClick={onActivate}
    >
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => { onEnabledChange(e.target.checked); if (e.target.checked) onActivate() }}
          onClick={(e) => e.stopPropagation()}
          className="size-4 shrink-0 cursor-pointer accent-[var(--ap-accent)]"
          aria-label={`Set ${label.toLowerCase()}`}
        />
        <span className={cn('text-body-sm', active ? 'font-semibold text-[var(--ap-fg)]' : 'text-[var(--ap-fg-muted)]')}>
          {label}
        </span>
        <span className="ml-auto font-mono text-caption text-[var(--ap-fg-subtle)]">{summary}</span>
      </div>

      {/* Time only becomes relevant once there is a date to attach it to. */}
      {enabled && dateStr && (
        <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ap-fg-subtle)]" aria-hidden />
          <select
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="ap-input h-7 flex-1 py-0 text-xs"
            aria-label={`${label} time`}
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t.value || 'all-day'} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-[var(--ap-radius-xs)] px-2 py-1 text-caption font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-danger-bg)] hover:text-[var(--ap-danger-fg)]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

export function DatesPanel({ startDate, dueDate, startTime, endTime, dueReminder, recurrenceRule, recurrenceEndsAt, sprintWindow, onSave, onRemove, onClose }: DatesPanelProps) {
  const today = new Date()
  const initialFocus = parseYmd(dueDate) ?? parseYmd(startDate) ?? today
  const [viewYear, setViewYear] = useState(initialFocus.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialFocus.getMonth())
  const [startEnabled, setStartEnabled] = useState(!!startDate)
  const [dueEnabled, setDueEnabled] = useState(!!dueDate)
  // Normalize Prisma ISO datetimes ("2026-05-06T00:00:00.000Z") to local YYYY-MM-DD
  // so the controlled inputs and calendar grid agree on which day is selected.
  const initStartD = parseYmd(startDate)
  const initDueD = parseYmd(dueDate)
  const [startStr, setStartStr] = useState<string | null>(initStartD ? ymd(initStartD) : null)
  const [dueStr, setDueStr] = useState<string | null>(initDueD ? ymd(initDueD) : null)
  const [startTimeVal, setStartTimeVal] = useState<string>(startTime ?? '')
  const [endTimeVal, setEndTimeVal] = useState<string>(endTime ?? '')
  const [reminderVal, setReminderVal] = useState<string>(dueReminder ?? '')
  const [recurrenceVal, setRecurrenceVal] = useState<string>(recurrenceRule ?? '')
  const initEndsAt = parseYmd(recurrenceEndsAt)
  const [recurrenceEndsVal, setRecurrenceEndsVal] = useState<string>(initEndsAt ? ymd(initEndsAt) : '')
  // Which date input the calendar populates on click. Defaults to "due" for
  // typical add-a-deadline flow; user can switch by clicking the Start row.
  const [activeTarget, setActiveTarget] = useState<'start' | 'due'>(dueDate || !startDate ? 'due' : 'start')

  const startD = parseYmd(startStr)
  const dueD = parseYmd(dueStr)

  // Build grid: 6 weeks × 7 days, starting Sunday before the 1st of viewMonth.
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(1 - firstOfMonth.getDay())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push(d)
  }

  const stepMonth = (delta: number) => {
    let m = viewMonth + delta, y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewMonth(m); setViewYear(y)
  }
  const stepYear = (delta: number) => setViewYear((y) => y + delta)

  const pickDay = (d: Date) => {
    const s = ymd(d)
    if (activeTarget === 'start') {
      setStartEnabled(true)
      setStartStr(s)
      // If start is pushed past due, drag due along so the range stays valid.
      if (dueEnabled && dueD && d.getTime() > dueD.getTime()) setDueStr(s)
    } else {
      setDueEnabled(true)
      setDueStr(s)
      // If due is pulled before start, drag start along.
      if (startEnabled && startD && d.getTime() < startD.getTime()) setStartStr(s)
    }
  }

  // DTE-6 — due must be on or after start. Blocked with a message rather than
  // silently corrected, so the user sees which of the two dates to fix.
  const rangeInvalid =
    startEnabled && dueEnabled && !!startD && !!dueD && dueD.getTime() < startD.getTime()

  // DTE-7 — dates outside the sprint window are allowed, but worth flagging.
  const outsideSprint = (() => {
    if (!sprintWindow?.startDate || !sprintWindow?.endDate) return false
    const ws = parseYmd(sprintWindow.startDate)
    const we = parseYmd(sprintWindow.endDate)
    if (!ws || !we) return false
    const picks = [startEnabled ? startD : null, dueEnabled ? dueD : null].filter(Boolean) as Date[]
    return picks.some((d) => d.getTime() < ws.getTime() || d.getTime() > we.getTime())
  })()

  const save = () => {
    if (rangeInvalid) return
    onSave({
      startDate: startEnabled ? startStr : null,
      dueDate: dueEnabled ? dueStr : null,
      startTime: startEnabled ? (startTimeVal || null) : null,
      endTime: dueEnabled ? (endTimeVal || null) : null,
      // A reminder without a due date has nothing to count back from.
      dueReminder: dueEnabled ? (reminderVal || null) : null,
      // Same for recurrence: the next occurrence is computed from the due date,
      // so a repeating card with no due date could never advance.
      recurrenceRule: dueEnabled ? (recurrenceVal || null) : null,
      recurrenceEndsAt: dueEnabled && recurrenceVal ? (recurrenceEndsVal || null) : null,
    })
  }

  return (
    <div>

      <div className="flex items-center justify-between px-1">
        <div className="flex gap-0.5">
          <button onClick={() => stepYear(-1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Previous year">«</button>
          <button onClick={() => stepMonth(-1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Previous month">‹</button>
        </div>
        <p className="text-body-sm font-semibold text-[var(--ap-fg)]">{MONTHS[viewMonth]} {viewYear}</p>
        <div className="flex gap-0.5">
          <button onClick={() => stepMonth(1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Next month">›</button>
          <button onClick={() => stepYear(1)} className="size-6 inline-flex items-center justify-center rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-hover)] text-[var(--ap-fg-muted)]" aria-label="Next year">»</button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-micro font-bold text-[var(--ap-fg-muted)] py-1">{w}</div>
        ))}
        {cells.map((d, i) => {
          const isOther = d.getMonth() !== viewMonth
          const isToday = sameDay(d, today)
          const isStart = sameDay(d, startD) && startEnabled
          const isDue = sameDay(d, dueD) && dueEnabled
          const isBetween = startEnabled && dueEnabled && inRange(d, startD, dueD) && !isStart && !isDue
          return (
            <button
              key={i}
              onClick={() => pickDay(d)}
              className={cn(
                'h-8 w-full rounded-[var(--ap-radius-xs)] text-xs font-medium transition-colors',
                isOther ? 'text-[var(--ap-fg-subtle)]' : 'text-[var(--ap-fg)]',
                !isStart && !isDue && !isBetween && 'hover:bg-[var(--ap-bg-hover)]',
                isBetween && 'bg-[var(--ap-accent-soft)]',
                (isStart || isDue) && 'bg-[var(--ap-accent)] text-white',
                isToday && !isStart && !isDue && 'underline decoration-[var(--ap-accent)] underline-offset-2',
              )}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      {/* Date rows.
          These used to be a free-text "M/D/YYYY" field parsed with `new Date()`
          plus a bare <input type="time">, which renders as "--:-- --" until
          touched and gives no hint of the expected format. The calendar above is
          the input now: the row shows a readable summary and clicking it makes
          it the target for the next day you pick. Time moved to an explicit
          picker that only appears once the date is on. */}
      <div className="mt-3 space-y-1.5">
        <DateRow
          label="Start date"
          enabled={startEnabled}
          onEnabledChange={setStartEnabled}
          active={activeTarget === 'start'}
          onActivate={() => setActiveTarget('start')}
          dateStr={startStr}
          time={startTimeVal}
          onTimeChange={setStartTimeVal}
          onClear={() => { setStartStr(null); setStartTimeVal('') }}
        />
        <DateRow
          label="Due date"
          enabled={dueEnabled}
          onEnabledChange={setDueEnabled}
          active={activeTarget === 'due'}
          onActivate={() => setActiveTarget('due')}
          dateStr={dueStr}
          time={endTimeVal}
          onTimeChange={setEndTimeVal}
          onClear={() => { setDueStr(null); setEndTimeVal('') }}
        />
      </div>

      {/* Recurring (DTE-5). Engine: lib/todos/recurrence.ts, generated nightly by
          app/api/cron/todo-recurrence. Requires a due date — the next occurrence
          is computed from it. */}
      <div className="mt-3">
        <label htmlFor="recurring" className="mb-1 block text-caption font-bold text-[var(--ap-fg)]">Recurring</label>
        <select
          id="recurring"
          value={recurrenceVal}
          disabled={!dueEnabled}
          onChange={(e) => setRecurrenceVal(e.target.value)}
          className="ap-input h-8 w-full text-xs py-0 disabled:opacity-50"
        >
          <option value="">Never</option>
          {RECURRENCE_RULES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        {recurrenceVal && dueEnabled && (
          <div className="mt-2">
            <label htmlFor="recurring-ends" className="mb-1 block text-caption font-semibold text-[var(--ap-fg-muted)]">
              Ends on <span className="font-normal">(optional)</span>
            </label>
            <input
              id="recurring-ends"
              type="date"
              value={recurrenceEndsVal}
              min={dueStr ?? undefined}
              onChange={(e) => setRecurrenceEndsVal(e.target.value)}
              className="ap-input h-8 w-full text-xs py-0"
            />
          </div>
        )}
        <p className="mt-1 text-micro text-[var(--ap-fg-subtle)]">
          {!dueEnabled
            ? 'Set a due date to repeat this card.'
            : recurrenceVal
              ? 'A fresh card is created before each occurrence is due, carrying the members, labels and checklist (with its dates) across.'
              : 'This card does not repeat.'}
        </p>
      </div>

      {/* Reminder (DTE-4) */}
      <div className="mt-3">
        <label htmlFor="due-reminder" className="mb-1 block text-caption font-bold text-[var(--ap-fg)]">
          Set due date reminder
        </label>
        <select
          id="due-reminder"
          value={reminderVal}
          disabled={!dueEnabled}
          onChange={(e) => setReminderVal(e.target.value)}
          className="ap-input h-8 w-full text-xs py-0 disabled:opacity-50"
        >
          <option value="">None</option>
          {DUE_REMINDERS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <p className="mt-1 text-micro text-[var(--ap-fg-subtle)]">
          Reminders go to all members and watchers of this card.
        </p>
      </div>

      {rangeInvalid && (
        <p className="mt-3 text-caption font-semibold" style={{ color: 'var(--ap-danger-fg)' }}>
          Due date must be on or after the start date.
        </p>
      )}
      {!rangeInvalid && outsideSprint && (
        <p
          className="mt-3 rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-caption"
          style={{ background: 'var(--ap-warn-bg)', color: 'var(--ap-warn-fg)' }}
        >
          This is outside the sprint window ({fmtMd(sprintWindow?.startDate ?? null)} – {fmtMd(sprintWindow?.endDate ?? null)}).
        </p>
      )}

      <div className="mt-4 space-y-2">
        <button
          onClick={save}
          disabled={rangeInvalid}
          className="w-full rounded-[var(--ap-radius-sm)] bg-[var(--ap-accent)] px-3 py-2 text-body-sm font-semibold text-[var(--ap-accent-fg)] transition-colors hover:bg-[var(--ap-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => { onRemove(); onClose() }}
          className="w-full rounded-[var(--ap-radius-sm)] border border-[var(--ap-border-strong)] bg-transparent px-3 py-2 text-body-sm font-semibold text-[var(--ap-fg)] hover:bg-[var(--ap-bg-hover)] transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}
