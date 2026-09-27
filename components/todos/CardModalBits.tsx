'use client'

/**
 * Small presentational pieces of the card modal: avatar, due badge, status and
 * priority pills, checklist progress bar. Split out of TodoCardModal.tsx.
 */

import { Calendar, ChevronDown } from 'lucide-react'
import { format, isToday, isTomorrow, differenceInCalendarDays, startOfToday } from 'date-fns'
import { userColor, userInitials } from '@/lib/user-color'
import { TODO_STATUS_META, todoStatusMeta } from '@/lib/todo-status'
import { dueTone, DUE_TONE_STYLE } from '@/lib/todos/due-tone'
import { PersonTooltip } from '@/components/shared/UserAvatar'
import { to12h } from './cardDateUtils'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, PRIORITY_COLORS } from './cardModalTypes'
import type { ChecklistItemData } from './cardModalTypes'

/**
 * Card-modal avatar. Kept local (not `UserAvatar`) because its 0.38 initials
 * scale is part of the modal's design. The full-name hover card is opt-in via
 * `tooltip` — only where the name is not already printed beside the avatar
 * (docs/user_name_hover_REQUIREMENTS.md UNH-6).
 */
export function Avatar({
  id, name, avatar, size = 22, tooltip = false, detail,
}: { id?: string | null; name: string; avatar?: string | null; size?: number; tooltip?: boolean; detail?: string }) {
  const initials = userInitials(name)
  const bg = userColor(id, name)
  const face = avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} alt={name} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      role="img"
      aria-label={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}
    >
      <span aria-hidden>{initials}</span>
    </span>
  )
  if (!tooltip) return face
  return <PersonTooltip person={{ id, name, avatar }} detail={detail}>{face}</PersonTooltip>
}

export function DueDateBadge({ dueDate, endTime }: { dueDate: string | null; endTime?: string | null }) {
  if (!dueDate) return null
  const d = new Date(dueDate)
  // Colour comes from the shared tone so this badge agrees with the board card,
  // the to-do row and the reminder system. It previously painted "due tomorrow"
  // GREEN, which reads as complete; green is now reserved for `done`.
  const tone = dueTone({ dueDate, endTime })

  // The design leads with the date and trails the relative note — "May 22 ·
  // overdue by 3 days" — which reads better than a bare "Overdue" prefix,
  // because the date is the fact and the lateness is the commentary.
  const days = differenceInCalendarDays(startOfToday(), d)
  const note = tone === 'overdue'
    ? (days === 1 ? 'overdue by 1 day' : `overdue by ${days} days`)
    : isToday(d) ? 'due today'
    : isTomorrow(d) ? 'due tomorrow'
    : null

  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ap-radius-xs)] px-2.5 text-[12.5px] font-semibold"
      style={DUE_TONE_STYLE[tone]}
    >
      <Calendar className="h-3.5 w-3.5" />
      {format(d, 'MMM d')}
      {endTime ? `, ${to12h(endTime)}` : ''}
      {note && <span className="font-medium opacity-85"> · {note}</span>}
    </span>
  )
}

/**
 * Neutral chrome, coloured dot — the design's metadata-line control. The native
 * <select> stays as the overlay: it is keyboard- and screen-reader-complete for
 * free, and it cannot collide with `activePanel`'s single popover slot.
 */
export function StatusPill({ status, onChange }: { status: string; onChange: (v: string) => void }) {
  const meta = todoStatusMeta(status)
  return (
    <label
      className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2 text-[12.5px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)]"
    >
      <span className="size-[7px] rounded-full" style={{ background: meta.dot }} />
      {meta.label}
      <ChevronDown className="h-3 w-3 opacity-50" />
      <select
        value={status}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Card status"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TODO_STATUS_META[s].label}</option>)}
      </select>
    </label>
  )
}

export function PriorityPill({ priority, onChange }: { priority: string; onChange: (v: string) => void }) {
  const dot = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.MEDIUM
  return (
    <label
      className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--ap-radius-xs)] border border-[var(--ap-border-strong)] bg-[var(--ap-bg-raised)] px-2.5 text-[12.5px] font-semibold text-[var(--ap-fg-muted)] transition-colors hover:bg-[var(--ap-bg-hover)]"
    >
      <span className="size-[9px] rounded-full" style={{ background: dot }} />
      {priority}
      <ChevronDown className="h-3 w-3 opacity-50" />
      <select
        value={priority}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Card priority"
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
  )
}

export function ChecklistProgress({ items }: { items: ChecklistItemData[] }) {
  if (items.length === 0) return null
  const done = items.filter((i) => i.completed).length
  const pct = Math.round((done / items.length) * 100)
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-10 shrink-0 text-right font-mono text-caption text-[var(--ap-fg-subtle)]">{done}/{items.length}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--ap-kr-bar-bg)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: pct === 100 ? 'var(--ap-ok)' : 'var(--ap-accent)' }}
        />
      </div>
    </div>
  )
}
