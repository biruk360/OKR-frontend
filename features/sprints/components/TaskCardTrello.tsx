'use client'

/**
 * TaskCardTrello — Trello-style card for the per-sprint kanban board.
 *
 * Visual reference: see plan file precious-knitting-catmull.md (screenshots
 * provided by the user). Uses Apple Pro design tokens — never raw hex.
 */

import { Eye, Calendar, MessageSquare, CheckSquare2, Target, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

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
}

interface Props {
  todo: TrelloTodo
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
}

/** Number of priority dots rendered along the top strip. */
const PRIORITY_DOTS: Record<string, number> = {
  URGENT: 5, HIGH: 4, MEDIUM: 3, LOW: 0,
}

function fmt(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function pickDateChipTone(args: {
  start: Date | null
  end: Date | null
  status: string
}): 'overdue' | 'done' | 'soon' | 'neutral' {
  const { start, end, status } = args
  if (status === 'COMPLETED') return 'done'
  if (end) {
    const now = new Date()
    if (end < now) return 'overdue'
    const days = (end.getTime() - now.getTime()) / 86400000
    if (days <= 2) return 'soon'
  }
  if (start && start > new Date()) return 'neutral'
  return 'neutral'
}

function MemberStack({ members }: { members: CardUser[] }) {
  if (members.length === 0) return null
  return (
    <div className="flex -space-x-1.5">
      {members.slice(0, 3).map((m) => {
        const initials = m.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
        return m.avatar ? (
          <img
            key={m.id}
            src={m.avatar}
            alt={m.name}
            title={m.name}
            className="h-5 w-5 rounded-full object-cover ring-2 ring-white"
          />
        ) : (
          <span
            key={m.id}
            title={m.name}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-white"
            style={{ background: 'var(--ap-accent)' }}
          >
            {initials}
          </span>
        )
      })}
      {members.length > 3 && (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground ring-2 ring-white">
          +{members.length - 3}
        </span>
      )}
    </div>
  )
}

export default function TaskCardTrello({ todo, onClick, onDragStart }: Props) {
  const start = todo.startDate ? new Date(todo.startDate) : null
  const end = todo.dueDate ? new Date(todo.dueDate) : null
  const tone = pickDateChipTone({ start, end, status: todo.status })

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

  const dateChipClass = cn(
    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
    tone === 'overdue' && 'bg-danger-100 text-danger-700',
    tone === 'done' && 'bg-success-100 text-success-700',
    tone === 'soon' && 'bg-warning-100 text-warning-700',
    tone === 'neutral' && 'bg-muted text-muted-foreground',
  )

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      className="group cursor-pointer overflow-hidden rounded-[8px] border bg-card shadow-sm transition hover:shadow-card"
      style={{ borderColor: 'var(--ap-border-soft, var(--ap-border))' }}
    >
      {/* URGENT striped indicator (mirrors the yellow striped band in the screenshots) */}
      {todo.priority === 'URGENT' && (
        <div
          aria-hidden
          className="h-1.5 w-full"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--ap-warn) 0 6px, rgba(255,149,0,0.5) 6px 12px)',
          }}
        />
      )}

      {/* Priority dots strip — small inset row of red dots, matches screenshot */}
      {dotCount > 0 && (
        <div className="flex items-center gap-0.5 px-2.5 pt-2">
          {Array.from({ length: dotCount }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                todo.priority === 'URGENT' && 'bg-danger-600',
                todo.priority === 'HIGH' && 'bg-danger-500',
                todo.priority === 'MEDIUM' && 'bg-warning-500',
              )}
            />
          ))}
        </div>
      )}

      <div className="px-2.5 pb-2.5 pt-1.5">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
          {todo.title}
        </p>

        {/* OKR pill */}
        {todo.keyResult && (
          <div
            className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: 'var(--ap-accent-soft, rgba(0,122,255,0.12))', color: 'var(--ap-accent)' }}
          >
            <Target className="h-3 w-3 shrink-0" />
            <span className="truncate">{todo.keyResult.title}</span>
          </div>
        )}

        {/* Meta row: icons + date chip */}
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {watcherCount > 0 && (
            <span title="Watching" className="inline-flex items-center gap-0.5">
              <Eye className="h-3 w-3" />
            </span>
          )}
          {(start || end) && (
            <span className={dateChipClass}>
              {tone === 'overdue' && <AlertCircle className="h-3 w-3" />}
              <Calendar className="h-3 w-3" />
              {start && end ? `${fmt(start)} - ${fmt(end)}` : fmt((end ?? start)!)}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {commentCount}
            </span>
          )}
          {checklistTotal > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1',
                checklistDone === checklistTotal && 'bg-success-100 text-success-700',
              )}
            >
              <CheckSquare2 className="h-3 w-3" />
              {checklistDone}/{checklistTotal}
            </span>
          )}
        </div>

        {/* Footer: spacer + member stack */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {todo.startTime && todo.endTime ? `${todo.startTime}–${todo.endTime}` : ''}
          </span>
          <MemberStack members={memberList} />
        </div>
      </div>
    </div>
  )
}
