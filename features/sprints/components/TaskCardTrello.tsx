'use client'

import { useState } from 'react'

/**
 * TaskCardTrello — Trello-style card for the per-sprint kanban board.
 *
 * Restyled in Phase 4 of docs/design_refresh_IMPLEMENTATION_STRATEGY.md (§6.3)
 * against design-import/"Modal design optimization with Trello"/Sprint Board.dc.html:
 *   - 10px radius, 5px cover strip (was h-8), 10/11/11px body padding
 *   - 22×6px pill label chips
 *   - a single 21px meta chip row (due / checklist / KR / watching) at 6px radius
 *   - hover lifts the border to the accent tint and deepens the shadow
 *
 * Uses Apple Pro design tokens — never raw hex. The only literals are the two
 * values the design specifies directly and that have no token: the hover border
 * tint and (in the dark fork) translucent white.
 */

import { Eye, Calendar, MessageSquare, CheckSquare2, Target, AlertCircle, RotateCcw, Paperclip, AlignLeft, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserAvatarStack } from '@/components/shared/UserAvatar'
import { swatchStyle, readableInk } from '@/lib/card-visuals'
import { useUserPrefsStore } from '@/lib/stores/user-prefs-store'
import { dueTone, DUE_TONE_STYLE } from '@/lib/todos/due-tone'

interface CardUser { id: string; name: string; avatar: string | null }

export interface TrelloTodo {
  id: string
  title: string
  status: string
  priority: string
  taskType?: string | null
  startDate?: string | null
  dueDate: string | null
  startTime?: string | null
  endTime?: string | null
  assignee?: CardUser | null
  members?: { user: CardUser }[]
  keyResult: { id: string; title: string } | null
  objective?: { id: string; title: string } | null
  /** Optional aggregates from the include set. Falls back to 0 when absent. */
  checklists?: { items?: { completed: boolean }[] }[]
  todoComments?: { id: string }[]
  watchers?: { userId: string }[]
  /** BR-03 carryover lineage — how many sprints this card has been carried into. */
  carryoverCount?: number
  /** Labels shown as a colour strip above the title (CRD-1). */
  labels?: { labelDef: { id: string; name: string; color: string; pattern?: string | null } }[]
  /** Cover colour + how it renders: BAND (strip) or FULL (full-bleed) (CRD-2). */
  coverColor?: string | null
  coverSize?: string | null
  /** Presence drives the "has description" glyph (CRD-3). */
  description?: string | null
  /** Attachment count badge (CRD-3). */
  _count?: { attachments?: number }
}

interface Props {
  todo: TrelloTodo
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  isDragging?: boolean
  /** FR-04 — closed sprints render read-only: no drag affordance. */
  readOnly?: boolean
  /**
   * Dark board ground (the `graphite` preset). The card surface stays light so
   * its own text keeps its contrast; what forks is the separation from the
   * ground — a hairline border and a soft shadow both vanish on a dark fill.
   */
  dark?: boolean
}

/** Number of priority dots rendered along the top strip. */
const PRIORITY_DOTS: Record<string, number> = {
  URGENT: 5, HIGH: 4, MEDIUM: 3, LOW: 0,
}

/** Shared geometry for every chip in the meta row (design: 21px / 6px radius). */
const META_CHIP =
  'inline-flex h-[21px] shrink-0 items-center gap-[5px] rounded-[var(--ap-radius-xs)] px-[7px] text-[11px] font-semibold'

function fmt(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}



export default function TaskCardTrello({ todo, onClick, onDragStart, onDragEnd, isDragging, readOnly, dark }: Props) {
  const start = todo.startDate ? new Date(todo.startDate) : null
  const end = todo.dueDate ? new Date(todo.dueDate) : null
  // Shared with every other due-date surface. The old private version compared
  // raw timestamps, so an all-day card due today read as overdue from 00:01.
  const tone = dueTone({
    dueDate: todo.dueDate,
    endTime: todo.endTime,
    done: todo.status === 'COMPLETED',
  })

  const dotCount = PRIORITY_DOTS[todo.priority] ?? 0

  // Aggregate counts
  const checklistTotal = (todo.checklists ?? []).reduce(
    (sum, c) => sum + (c.items?.length ?? 0),
    0,
  )
  const checklistDone = (todo.checklists ?? []).reduce(
    (sum, c) => sum + (c.items?.filter((i) => i.completed).length ?? 0),
    0,
  )
  const commentCount = todo.todoComments?.length ?? 0
  const watcherCount = todo.watchers?.length ?? 0

  // Members: prefer explicit members[], fall back to legacy assignee
  const memberList: CardUser[] = todo.members && todo.members.length > 0
    ? todo.members.map((m) => m.user)
    : todo.assignee
      ? [todo.assignee]
      : []

  const colorBlind = useUserPrefsStore((st) => st.colorBlindMode)
  const [labelsExpanded, setLabelsExpanded] = useState(false)
  const attachmentCount = todo._count?.attachments ?? 0
  const hasDescription = Boolean(todo.description && todo.description.trim())
  const labels = todo.labels ?? []
  const hasTimeRange = Boolean(todo.startTime && todo.endTime)

  // CRD-2 — FULL covers put the title directly on the colour, so the ink has to
  // be chosen from the cover's luminance to stay readable on both light swatches
  // (yellow, lime) and dark ones (slate, blue).
  const isFullCover = Boolean(todo.coverColor) && todo.coverSize === 'FULL'
  const coverInk = isFullCover && todo.coverColor ? readableInk(todo.coverColor) : undefined

  const checklistComplete = checklistTotal > 0 && checklistDone === checklistTotal

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : onDragStart}
      onDragEnd={readOnly ? undefined : onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className={cn(
        // Border colour lives in a class, not an inline style, so the :hover
        // variant can actually win. An inline borderColor would beat it.
        'group cursor-pointer overflow-hidden rounded-[10px] border transition-[border-color,box-shadow] duration-150',
        dark
          ? 'border-[oklch(1_0_0_/_0.22)] shadow-[0_2px_10px_-2px_oklch(0.15_0.03_260_/_0.5)] hover:border-[oklch(0.82_0.08_255)] hover:shadow-[0_6px_18px_-4px_oklch(0.15_0.03_260_/_0.6)]'
          : 'border-[var(--ap-border)] shadow-[var(--ap-shadow-card)] hover:border-[oklch(0.72_0.1_255)] hover:shadow-[var(--ap-shadow-md)]',
        !isFullCover && 'bg-[var(--ap-bg-raised)]',
      )}
      style={{
        opacity: isDragging ? 0.4 : undefined,
        ...(isFullCover && todo.coverColor
          ? { ...swatchStyle(todo.coverColor, { colorBlind, ink: 'rgba(255,255,255,0.25)' }), color: coverInk }
          : {}),
      }}
    >
      {/* Cover band (CRD-2) — 5px in the design. FULL covers paint the whole
          card instead, above. */}
      {todo.coverColor && !isFullCover && (
        <div
          aria-hidden
          className="h-[5px] w-full"
          style={swatchStyle(todo.coverColor, { colorBlind, ink: 'rgba(255,255,255,0.28)' })}
        />
      )}

      {/* URGENT striped indicator. Both stops are the warn token — mixing it
          with a literal iOS orange made the stripe two different oranges once
          --ap-warn was retargeted to oklch(0.72 0.14 70). */}
      {todo.priority === 'URGENT' && (
        <div
          aria-hidden
          className="h-[5px] w-full"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--ap-warn) 0 6px, color-mix(in oklab, var(--ap-warn) 50%, transparent) 6px 12px)',
          }}
        />
      )}

      {/* Priority dots strip — small inset row of dots */}
      {dotCount > 0 && (
        <div className="flex items-center gap-[3px] px-[11px] pt-[9px]">
          {Array.from({ length: dotCount }).map((_, i) => (
            <span
              key={i}
              className="h-[5px] w-[5px] rounded-full"
              style={{
                background:
                  todo.priority === 'URGENT' ? 'var(--ap-danger)'
                    : todo.priority === 'HIGH' ? 'var(--ap-danger)'
                      : 'var(--ap-warn)',
                opacity: todo.priority === 'HIGH' ? 0.75 : 1,
              }}
            />
          ))}
        </div>
      )}

      <div className={cn('px-[11px] pb-[11px]', dotCount > 0 ? 'pt-[7px]' : 'pt-[10px]')}>
        {/* Label strip (CRD-1) — 22×6px pills. Colour alone is not enough, so
            each chip carries an accessible name and, in colour-blind mode, a
            distinct texture. */}
        {labels.length > 0 && (
          <div className="mb-[7px] flex flex-wrap gap-1">
            {labels.map((l) => (
              <button
                key={l.labelDef.id}
                type="button"
                title={l.labelDef.name}
                aria-label={`Label: ${l.labelDef.name}. Click to ${labelsExpanded ? 'collapse' : 'show names'}.`}
                aria-pressed={labelsExpanded}
                // CRD-1 — clicking any chip toggles names for the whole card,
                // as Trello does. stopPropagation so it does not open the card.
                onClick={(e) => { e.stopPropagation(); setLabelsExpanded((v) => !v) }}
                className={cn(
                  'flex items-center overflow-hidden rounded-[var(--ap-radius-pill)] transition-all',
                  labelsExpanded ? 'h-[15px] min-w-[22px] px-1.5' : 'h-[6px] w-[22px]',
                )}
                style={swatchStyle(l.labelDef.color, {
                  colorBlind,
                  pattern: l.labelDef.pattern,
                  ink: 'rgba(255,255,255,0.55)',
                })}
              >
                {labelsExpanded && (
                  <span
                    className="truncate text-[9px] font-semibold leading-none"
                    style={{ color: readableInk(l.labelDef.color) }}
                  >
                    {l.labelDef.name}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-start gap-1.5">
          <p
            className="line-clamp-2 min-w-0 flex-1 text-[13.5px] font-medium leading-[1.4]"
            style={isFullCover ? undefined : { color: 'var(--ap-fg)' }}
          >
            {todo.title}
          </p>
          {/* Carryover badge (FR-05 / UX-06) — amber at 2+ carries */}
          {(todo.carryoverCount ?? 0) > 0 && (
            <span
              className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-[var(--ap-radius-xs)] px-1.5 py-px text-[10px] font-semibold"
              style={{
                background: (todo.carryoverCount ?? 0) >= 2 ? 'var(--ap-warn-bg)' : 'var(--ap-none-bg)',
                color: (todo.carryoverCount ?? 0) >= 2 ? 'var(--ap-warn-fg)' : 'var(--ap-none-fg)',
              }}
              title={
                (todo.carryoverCount ?? 0) >= 2
                  ? `Carried ${todo.carryoverCount} times — consider splitting or descoping`
                  : 'Carried over from a previous sprint'
              }
            >
              <RotateCcw className="h-[9px] w-[9px]" /> ×{todo.carryoverCount}
            </span>
          )}
        </div>

        {/* Meta chip row — due / checklist / KR / watching, then members. */}
        <div className="mt-[9px] flex flex-wrap items-center gap-[6px]">
          {(start || end) && (
            <span
              className={META_CHIP}
              style={DUE_TONE_STYLE[tone]}
              title={
                tone === 'overdue' ? 'Overdue'
                  : tone === 'soon' ? 'Due soon'
                    : tone === 'today' ? 'Due today'
                      : tone === 'done' ? 'Completed'
                      : 'Scheduled'
              }
            >
              {tone === 'overdue' ? <AlertCircle className="h-[10px] w-[10px]" /> : <Calendar className="h-[10px] w-[10px]" />}
              {start && end ? `${fmt(start)} – ${fmt(end)}` : fmt((end ?? start)!)}
            </span>
          )}

          {hasTimeRange && (
            <span
              className={META_CHIP}
              style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-secondary)' }}
              title={`${todo.startTime}–${todo.endTime}`}
            >
              <Clock className="h-[10px] w-[10px]" />
              {todo.startTime}–{todo.endTime}
            </span>
          )}

          {checklistTotal > 0 && (
            <span
              className={META_CHIP}
              style={
                checklistComplete
                  ? { background: 'var(--ap-ok-bg)', color: 'var(--ap-ok-fg)' }
                  : { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-secondary)' }
              }
              title={`Checklist: ${checklistDone} of ${checklistTotal} done`}
            >
              <CheckSquare2 className="h-[10px] w-[10px]" />
              {checklistDone}/{checklistTotal}
            </span>
          )}

          {todo.keyResult && (
            <span
              className={cn(META_CHIP, 'min-w-0 max-w-[150px]')}
              style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent-on-soft)' }}
              title={`Linked to key result: ${todo.keyResult.title}`}
            >
              <Target className="h-[10px] w-[10px] shrink-0" />
              <span className="truncate">{todo.keyResult.title}</span>
            </span>
          )}

          {attachmentCount > 0 && (
            <span
              className={META_CHIP}
              style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-secondary)' }}
              title={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
              aria-label={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
            >
              <Paperclip className="h-[10px] w-[10px]" />
              {attachmentCount}
            </span>
          )}

          {commentCount > 0 && (
            <span
              className={META_CHIP}
              style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-secondary)' }}
              title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
              aria-label={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
            >
              <MessageSquare className="h-[10px] w-[10px]" />
              {commentCount}
            </span>
          )}

          {hasDescription && (
            <span
              className="inline-flex shrink-0 items-center"
              style={{ color: 'var(--ap-fg-subtle)' }}
              title="This card has a description"
              aria-label="Has a description"
            >
              <AlignLeft className="h-[13px] w-[13px]" />
            </span>
          )}

          {watcherCount > 0 && (
            <span
              className="inline-flex shrink-0 items-center"
              style={{ color: 'var(--ap-fg-subtle)' }}
              title="You are watching this card"
              aria-label="You are watching this card"
            >
              <Eye className="h-[13px] w-[13px]" />
            </span>
          )}

          {memberList.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center">
              <UserAvatarStack users={memberList} size={22} max={3} />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
