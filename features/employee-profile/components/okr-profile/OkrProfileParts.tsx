'use client'

/**
 * Small presentational pieces shared by the OKR profile tree, the past section
 * and the quick view. Apple Pro tokens only.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarClock, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { MiniBadge, type MiniBadgeTone } from '@/components/ui/dashboard/MiniBadge'
import { cn, getProgressBarColor } from '@/lib/utils'
import { KR_COMMITMENT_LABELS, KR_COMMITMENT_SHORT, type KrCommitment } from '@/types/package'
import { CHECKPOINT_DUE_WINDOW_DAYS, LEVEL_BUCKET_LABELS, isDueWithinDays, utcDayStart } from './okr-profile-utils'
import type { OkrProfileCheckpoint, OkrProfileLevelBucket } from './types'

export function formatDay(iso: string | null | undefined, opts: { year?: boolean } = {}): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(opts.year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

export function formatRelativeDay(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const days = Math.round((utcDayStart(now) - utcDayStart(d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return formatDay(iso, { year: true })
}

export function isOverdue(iso: string | null | undefined, status: string, now: Date = new Date()): boolean {
  if (!iso || status === 'COMPLETED' || status === 'CANCELLED') return false
  return new Date(iso).getTime() < utcDayStart(now)
}

const LEVEL_TONE: Record<OkrProfileLevelBucket, MiniBadgeTone> = {
  company: 'accent',
  department: 'ahead',
  individual: 'neutral',
  contributed: 'warn',
}

export function LevelBadge({ bucket }: { bucket: OkrProfileLevelBucket }) {
  return <MiniBadge tone={LEVEL_TONE[bucket]}>{LEVEL_BUCKET_LABELS[bucket]}</MiniBadge>
}

export function CommitmentPill({ commitment }: { commitment: KrCommitment | null }) {
  if (!commitment) return null
  const hint =
    commitment === 'ASPIRATIONAL'
      ? `${KR_COMMITMENT_LABELS[commitment]} — 70% = success`
      : commitment === 'COMMITTED'
        ? `${KR_COMMITMENT_LABELS[commitment]} — 100% expected`
        : KR_COMMITMENT_LABELS[commitment]
  return (
    <span title={hint} aria-label={hint}>
      <MiniBadge tone={commitment === 'COMMITTED' ? 'accent' : commitment === 'ASPIRATIONAL' ? 'ahead' : 'neutral'} mono>
        {KR_COMMITMENT_SHORT[commitment]}
      </MiniBadge>
    </span>
  )
}

export function ProgressCell({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)))
  return (
    <span className={cn('inline-flex w-[112px] shrink-0 items-center gap-2', className)}>
      <Progress value={pct} fill={getProgressBarColor(pct)} className="flex-1" aria-label={`Progress ${pct}%`} />
      <span className="w-9 text-right font-mono text-caption tabular-nums text-[var(--ap-fg-muted)]">{pct}%</span>
    </span>
  )
}

/** Title that links to the detail page, or "Private …" for a redacted row. */
export function NodeTitle({
  href,
  title,
  refText,
  redacted,
  privateLabel,
  strong,
}: {
  href: string
  title: string | null
  refText: string | null
  redacted: boolean
  privateLabel: string
  strong?: boolean
}) {
  if (redacted || !title) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-body-sm italic text-[var(--ap-fg-muted)]">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        {privateLabel}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className={cn(
        'min-w-0 truncate rounded-[var(--ap-radius-xs)] text-body-sm text-[var(--ap-fg)] ap-focus-ring hover:text-[var(--ap-accent)] hover:underline',
        strong && 'font-semibold',
      )}
      title={title}
      onClick={(e) => e.stopPropagation()}
    >
      {refText && <span className="mr-1.5 font-mono text-caption font-semibold text-[var(--ap-fg-subtle)]">{refText}</span>}
      {title}
    </Link>
  )
}

export function CheckpointChip({ checkpoint, now }: { checkpoint: OkrProfileCheckpoint | null; now?: Date }) {
  if (!checkpoint) return null
  const soon = isDueWithinDays(checkpoint.dueDate, CHECKPOINT_DUE_WINDOW_DAYS, now)
  const text = `${checkpoint.label} · ${formatDay(checkpoint.dueDate)}`
  const hint = `Next checkpoint ${checkpoint.label}, due ${formatDay(checkpoint.dueDate, { year: true })}: ${checkpoint.targetText}`
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-micro font-semibold"
      style={{
        background: soon ? 'var(--ap-warn-bg)' : 'var(--ap-bg-sunken)',
        color: soon ? 'var(--ap-warn-fg)' : 'var(--ap-fg-muted)',
      }}
      title={hint}
      aria-label={hint}
    >
      <CalendarClock className="size-3" aria-hidden />
      {text}
    </span>
  )
}

export function ExpandToggle({
  expanded,
  onToggle,
  label,
  disabled,
}: {
  expanded: boolean
  onToggle: () => void
  label: string
  disabled?: boolean
}) {
  if (disabled) return <span className="inline-block size-5 shrink-0" aria-hidden />
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--ap-radius-xs)] text-[var(--ap-fg-subtle)] ap-focus-ring hover:bg-[var(--ap-bg-hover)] hover:text-[var(--ap-fg)]"
    >
      {expanded ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
    </button>
  )
}

/** Indented child block with the tree guide line. */
export function TreeChildren({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('ml-[9px] space-y-1 border-l border-[var(--ap-border)] pl-3', className)}>{children}</div>
}

export function GroupLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <span className="text-micro font-semibold uppercase tracking-[0.6px] text-[var(--ap-fg-subtle)]">{children}</span>
      {right}
    </div>
  )
}
