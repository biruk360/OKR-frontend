'use client'

import { cn } from '@/lib/utils'
import type { DistributionMode } from '@/types/automations'

/**
 * Mode is the most important thing on the card: it says whether this automation
 * can email people. Dry run reads as inert, auto reads as live.
 */
const MODE_STYLE: Record<DistributionMode, { label: string; className: string; hint: string }> = {
  DRY_RUN: { label: 'Dry run', className: 'bg-surface-muted text-ink-secondary', hint: 'Creates briefings, sends nothing' },
  REVIEW: { label: 'Review', className: 'bg-warning-500/15 text-warning-600', hint: 'You approve before recipients get it' },
  AUTO: { label: 'Auto', className: 'bg-success-500/15 text-success-600', hint: 'Sends to recipients automatically' },
}

const STATUS_STYLE: Record<string, string> = {
  ENABLED: 'bg-primary-500/10 text-primary-600',
  PAUSED: 'bg-surface-muted text-ink-secondary',
  DISABLED_ON_FAILURE: 'bg-danger-500/10 text-danger-500',
  ENDED: 'bg-surface-muted text-ink-secondary',
}

const RUN_STATUS_STYLE: Record<string, string> = {
  QUEUED: 'bg-surface-muted text-ink-secondary',
  LEASED: 'bg-primary-500/10 text-primary-600',
  RUNNING: 'bg-primary-500/10 text-primary-600',
  SUCCEEDED: 'bg-success-500/10 text-success-600',
  FAILED: 'bg-danger-500/10 text-danger-500',
  SKIPPED: 'bg-surface-muted text-ink-secondary',
  MISSED: 'bg-warning-500/15 text-warning-600',
  CANCELLED: 'bg-surface-muted text-ink-secondary',
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  )
}

export function ModeBadge({ mode, showHint = false }: { mode: DistributionMode; showHint?: boolean }) {
  const style = MODE_STYLE[mode] ?? MODE_STYLE.DRY_RUN
  return (
    <span className="inline-flex items-center gap-2">
      <Pill className={style.className}>{style.label}</Pill>
      {showHint && <span className="text-xs text-ink-secondary">{style.hint}</span>}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Pill className={STATUS_STYLE[status] ?? 'bg-surface-muted text-ink-secondary'}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </Pill>
  )
}

export function RunStatusBadge({ status }: { status: string }) {
  return (
    <Pill className={RUN_STATUS_STYLE[status] ?? 'bg-surface-muted text-ink-secondary'}>
      {status.toLowerCase()}
    </Pill>
  )
}

export { MODE_STYLE }
