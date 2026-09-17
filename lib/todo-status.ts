import type { TodoStatus } from '@/types'

export const TODO_STATUSES: readonly TodoStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'IN_REVIEW',
  'STUCK',
  'COMPLETED',
  'CANCELLED',
] as const

export const BOARD_STATUSES: readonly TodoStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'IN_REVIEW',
  'STUCK',
  'COMPLETED',
] as const

export interface TodoStatusMeta {
  label: string
  shortLabel: string
  bg: string
  fg: string
  dot: string
  tone: 'neutral' | 'primary' | 'warning' | 'danger' | 'success'
}

/**
 * Status colours. These were literal rgba/hex copies of the pre-refresh Apple-HIG
 * palette — a satellite copy that nothing kept in sync with globals.css. They now
 * reference the tokens, so they follow the theme (including dark mode) for free.
 *
 * This map is CANONICAL. The refreshed designs disagree with each other on the
 * status set (the card modal offers six, the board shows five) and on STUCK's
 * colour (amber on the board, red in the modal). Per Decision 0 in
 * docs/design_refresh_IMPLEMENTATION_STRATEGY.md, this file wins: take the hues
 * from the tokens, never the set or the semantics from a mock.
 */
export const TODO_STATUS_META: Record<TodoStatus, TodoStatusMeta> = {
  PENDING:     { label: 'To Do',        shortLabel: 'To Do',     bg: 'var(--ap-none-bg)',    fg: 'var(--ap-none-fg)',    dot: 'var(--ap-none)',    tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress',  shortLabel: 'Doing',     bg: 'var(--ap-accent-soft)', fg: 'var(--ap-accent-on-soft)', dot: 'var(--ap-accent)', tone: 'primary' },
  IN_REVIEW:   { label: 'In Review',    shortLabel: 'Review',    bg: 'var(--ap-ahead-bg)',   fg: 'var(--ap-ahead-fg)',   dot: 'var(--ap-ahead)',   tone: 'primary' },
  STUCK:       { label: 'Stuck',        shortLabel: 'Stuck',     bg: 'var(--ap-warn-bg)',    fg: 'var(--ap-warn-fg)',    dot: 'var(--ap-warn)',    tone: 'warning' },
  COMPLETED:   { label: 'Done',         shortLabel: 'Done',      bg: 'var(--ap-ok-bg)',      fg: 'var(--ap-ok-fg)',      dot: 'var(--ap-ok)',      tone: 'success' },
  CANCELLED:   { label: 'Cancelled',    shortLabel: 'Cancelled', bg: 'var(--ap-danger-bg)',  fg: 'var(--ap-danger-fg)',  dot: 'var(--ap-danger)',  tone: 'neutral' },
}

export function todoStatusMeta(status: string): TodoStatusMeta {
  return TODO_STATUS_META[status as TodoStatus] ?? TODO_STATUS_META.PENDING
}

export function isBoardStatus(status: string): status is TodoStatus {
  return (BOARD_STATUSES as readonly string[]).includes(status)
}
