'use client'

import { Calendar, Paperclip, CheckSquare } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import { cn } from '@/lib/utils'

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

const PRIORITY_DOT: Record<string, string> = {
  LOW: '#8E8E93', MEDIUM: '#FF9500', HIGH: '#FF3B30', URGENT: '#AF52DE',
}

function Avatar({ name, avatar, size = 20 }: { name: string; avatar?: string | null; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const colors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return avatar ? (
    <img src={avatar} alt={name} title={name} className="rounded-full object-cover ring-2 ring-[var(--ap-bg-raised)]" style={{ width: size, height: size }} />
  ) : (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-[var(--ap-bg-raised)]"
      style={{ width: size, height: size, fontSize: size * 0.38, background: bg }}
    >
      {initials}
    </span>
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
      className={cn(
        'ap-card cursor-pointer select-none overflow-hidden transition-shadow hover:shadow-[var(--ap-shadow-md)] active:scale-[0.98]',
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
        <p className={cn('text-[13px] font-500 leading-snug text-[var(--ap-fg)] line-clamp-3', isCompleted && 'line-through text-[var(--ap-fg-subtle)]')}>
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
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-500',
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
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-500',
                  checklist.done === checklist.total ? 'bg-[var(--ap-ok-bg)] text-[var(--ap-ok-fg)]' : 'bg-[var(--ap-bg-sunken)] text-[var(--ap-fg-subtle)]',
                )}>
                  <CheckSquare className="h-2.5 w-2.5" />
                  {checklist.done}/{checklist.total}
                </span>
              )}
              {attachmentCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--ap-bg-sunken)] px-1.5 py-0.5 text-[11px] text-[var(--ap-fg-subtle)]">
                  <Paperclip className="h-2.5 w-2.5" />
                  {attachmentCount}
                </span>
              )}
            </div>
            {/* Avatars */}
            <div className="flex -space-x-1.5 shrink-0">
              {assignee && <Avatar name={assignee.name} avatar={assignee.avatar} size={20} />}
              {members.slice(0, 3).map((m) => <Avatar key={m.id} name={m.name} avatar={m.avatar} size={20} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
