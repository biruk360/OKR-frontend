'use client'

import { cn } from '@/lib/utils'
import {
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_STATUS_TOKEN,
  type ActivityStatus,
  type RagStatus,
} from '../types'

/** RAG chip — GREEN/AMBER/RED with semantic tokens + label (never color alone, per a11y). */
export function RagBadge({ rag, className }: { rag: string; className?: string }) {
  const map: Record<string, string> = {
    GREEN: 'bg-success-50 text-success-700',
    AMBER: 'bg-warning-50 text-warning-700',
    RED: 'bg-danger-50 text-danger-700',
  }
  const dot: Record<string, string> = { GREEN: 'bg-success-500', AMBER: 'bg-warning-500', RED: 'bg-danger-500' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-body-sm font-medium', map[rag] ?? map.GREEN, className)}>
      <span className={cn('size-1.5 rounded-full', dot[rag] ?? dot.GREEN)} />
      {rag.charAt(0) + rag.slice(1).toLowerCase()}
    </span>
  )
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
}

export function ProjectStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone: Record<string, string> = {
    PLANNING: 'bg-surface-muted text-ink-secondary',
    ACTIVE: 'bg-primary-50 text-primary-700',
    ON_HOLD: 'bg-warning-50 text-warning-700',
    COMPLETED: 'bg-success-50 text-success-700',
    CANCELLED: 'bg-danger-50 text-danger-700',
  }
  return (
    <span className={cn('inline-flex items-center rounded-pill px-2.5 py-0.5 text-body-sm font-medium', tone[status] ?? tone.PLANNING, className)}>
      {PROJECT_STATUS_LABEL[status] ?? status}
    </span>
  )
}

/**
 * Activity status pill using the exact Instagantt-parity colors (registered as
 * `project-status-*` tokens). Text color is chosen for contrast on each swatch.
 */
export function ActivityStatusBadge({ status, className }: { status: ActivityStatus; className?: string }) {
  // The two light swatches (grey/light-blue/yellow) need dark ink; the darker ones need white.
  const darkInk: ActivityStatus[] = ['NOT_STARTED', 'STARTED', 'APPROVAL_REQUESTED']
  const token = ACTIVITY_STATUS_TOKEN[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2 py-0.5 text-body-sm font-medium',
        `bg-${token}`,
        darkInk.includes(status) ? 'text-ink-primary' : 'text-white',
        className
      )}
    >
      {ACTIVITY_STATUS_LABEL[status]}
    </span>
  )
}
