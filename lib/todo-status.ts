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

export const TODO_STATUS_META: Record<TodoStatus, TodoStatusMeta> = {
  PENDING:     { label: 'To Do',       shortLabel: 'To Do',    bg: 'rgba(142,142,147,0.15)', fg: '#6E6E73', dot: '#8E8E93', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', shortLabel: 'Doing',    bg: 'rgba(0,122,255,0.14)',   fg: '#0051D5', dot: '#0A84FF', tone: 'primary' },
  IN_REVIEW:   { label: 'In Review',   shortLabel: 'Review',   bg: 'rgba(175,82,222,0.14)',  fg: '#7A2BB8', dot: '#AF52DE', tone: 'primary' },
  STUCK:       { label: 'Stuck',       shortLabel: 'Stuck',    bg: 'rgba(255,149,0,0.14)',   fg: '#B86200', dot: '#FF9500', tone: 'warning' },
  COMPLETED:   { label: 'Done',        shortLabel: 'Done',     bg: 'rgba(52,199,89,0.18)',   fg: '#1B6B30', dot: '#34C759', tone: 'success' },
  CANCELLED:   { label: 'Cancelled',   shortLabel: 'Cancelled', bg: 'rgba(255,59,48,0.14)',  fg: '#B32A22', dot: '#FF3B30', tone: 'neutral' },
}

export function todoStatusMeta(status: string): TodoStatusMeta {
  return TODO_STATUS_META[status as TodoStatus] ?? TODO_STATUS_META.PENDING
}

export function isBoardStatus(status: string): status is TodoStatus {
  return (BOARD_STATUSES as readonly string[]).includes(status)
}
