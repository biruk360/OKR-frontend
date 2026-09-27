'use client'

import { Calendar, Paperclip, CheckSquare } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { userColor, userInitials } from '@/lib/user-color'
import { PersonTooltip } from '@/components/shared/UserAvatar'

interface Label { name: string; color: string }
interface Member { id: string; name: string; avatar?: string | null }
interface ChecklistSummary { total: number; done: number }

export interface TodoCardProps {
  id: string
  title: string
  coverColor?: string | null
  labels?: Label[]
  members?: Member[]
  assignee?: Member
  dueDate?: string | null
  checklist?: ChecklistSummary
  attachmentCount?: number
  status?: string
  priority?: string
  onClick?: () => void
  draggable?: boolean
  onDragStart?: React.DragEventHandler
  onDragEnd?: React.DragEventHandler
  className?: string
}

/** Mirrors TodoCardModal's PRIORITY_COLORS — status tokens, never hex (§2.11). */
const PRIORITY_DOT: Record<string, string> = {
  LOW: 'var(--ap-none)',
  MEDIUM: 'var(--ap-warn)',
  HIGH: 'var(--ap-danger)',
  URGENT: 'var(--ap-ahead)',
}

/**
 * Avatar colour and initials come from `lib/user-color`, the same source the card
 * modal and the board use — this file used to carry its own six-hex palette keyed
 * off `name.charCodeAt(0)`, so the same person was one colour here and another
 * everywhere else.
 */
function Avatar({ id, name, avatar, size = 20, detail }: { id?: string | null; name: string; avatar?: string | null; size?: number; detail?: string }) {
  const initials = userInitials(name)
  const bg = userColor(id, name)
  // Full name on hover — docs/user_name_hover_REQUIREMENTS.md UNH-2.
  return (
    <PersonTooltip person={{ id, name, avatar }} detail={detail}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={name} className="shrink-0 rounded-full object-cover ring-2 ring-[var(--ap-bg-raised)]" style={{ width: size, height: size }} />
      ) : (
        <span
          role="img"
          aria-label={name}
          className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-[var(--ap-bg-raised)]"
          style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}
        >
          <span aria-hidden>{initials}</span>
        </span>
      )}
    </PersonTooltip>
  )
}

export function TodoCard({
  title,
  coverColor,
  labels = [],
  members = [],
  assignee,
  dueDate,
  checklist,
  attachmentCount = 0,
  status,
  priority,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  className,
}: TodoCardProps) {
  const isCompleted = status === 'COMPLETED'
  const duePast = dueDate && isPast(new Date(dueDate)) && !isToday(new Date(dueDate))
  const dueToday = dueDate && isToday(new Date(dueDate))

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      // Keyboard + screen-reader access to the same action as the click.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? title : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      } : undefined}
      className={cn(
        'ap-card ap-hover-lift cursor-pointer select-none overflow-hidden transition-shadow hover:shadow-[shadow:var(--ap-shadow-md)] active:scale-[0.98]',
        className,
      )}
    >
      {/* Cover */}
      {coverColor && <div className="h-8 w-full" style={{ background: coverColor }} />}

      <div className="p-3 space-y-2.5">
        {/* Labels */}
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((l) => (
              <span
                key={l.name}
                className="h-2 w-8 rounded-full"
                title={l.name}
                style={{ background: l.color }}
              />
            ))}
          </div>
        )}

        {/* Title */}
        <p className={cn('text-body-sm font-medium leading-snug text-[var(--ap-fg)] line-clamp-3', isCompleted && 'line-through text-[var(--ap-fg-subtle)]')}>
          {priority && priority !== 'MEDIUM' && (
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: PRIORITY_DOT[priority] }} />
          )}
          {title}
        </p>

        {/* Footer chips */}
        {(dueDate || checklist || attachmentCount > 0 || members.length > 0 || assignee) && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {dueDate && (
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-[var(--ap-radius-xs)] px-1.5 py-0.5 text-caption font-medium',
                  duePast ? 'bg-[var(--ap-danger-bg)] text-[var(--ap-danger-fg)]' :
                    dueToday ? 'bg-[var(--ap-warn-bg)] text-[var(--ap-warn-fg)]' :
                      'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg-subtle)]',
                )}>
                  <Calendar className="h-2.5 w-2.5" />
                  {format(new Date(dueDate), 'MMM d')}
                </span>
              )}
              {checklist && checklist.total > 0 && (
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-[var(--ap-radius-xs)] px-1.5 py-0.5 text-caption font-medium',
                  checklist.done === checklist.total ? 'bg-[var(--ap-ok-bg)] text-[var(--ap-ok-fg)]' : 'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg-subtle)]',
                )}>
                  <CheckSquare className="h-2.5 w-2.5" />
                  {checklist.done}/{checklist.total}
                </span>
              )}
              {attachmentCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-[var(--ap-radius-xs)] bg-[var(--ap-bg-sunken)] px-1.5 py-0.5 text-caption text-[var(--ap-fg-subtle)]">
                  <Paperclip className="h-2.5 w-2.5" />
                  {attachmentCount}
                </span>
              )}
            </div>
            {/* Avatars */}
            <div className="flex -space-x-1.5 shrink-0">
              {assignee && <Avatar id={assignee.id} name={assignee.name} avatar={assignee.avatar} size={20} detail="Assignee" />}
              {members.slice(0, 3).map((m) => <Avatar key={m.id} id={m.id} name={m.name} avatar={m.avatar} size={20} detail="Member" />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
