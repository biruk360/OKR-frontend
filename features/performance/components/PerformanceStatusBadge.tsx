'use client'

import { cn } from '@/lib/utils'

/** Humanizes a raw enum value: "DRAFT_SHARED" → "Draft shared". */
export function humanizeEnum(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

type Tone = { bg: string; fg: string; dot: string }

// Tints mirror components/shared/StatusPill.tsx (Apple Pro rgba tints + --ap vars).
const TONES: Record<string, Tone> = {
  blue: { bg: 'rgba(0,122,255,0.12)', fg: 'var(--ap-accent)', dot: 'var(--ap-accent)' },
  teal: { bg: 'rgba(48,176,199,0.14)', fg: '#0E7C8C', dot: '#30B0C7' },
  purple: { bg: 'rgba(175,82,222,0.14)', fg: '#7A2BB8', dot: '#AF52DE' },
  warning: { bg: 'rgba(255,149,0,0.14)', fg: '#B86200', dot: '#FF9500' },
  success: { bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)', dot: 'var(--ap-green)' },
  danger: { bg: 'rgba(255,59,48,0.12)', fg: 'var(--ap-red)', dot: 'var(--ap-red)' },
  neutral: { bg: 'rgba(120,120,128,0.12)', fg: 'var(--ap-fg-muted)', dot: 'var(--ap-fg-muted)' },
}

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  // Evaluation lifecycle
  ASSIGNED: 'blue',
  IN_PROGRESS: 'blue',
  CONSOLIDATED: 'teal',
  CALIBRATION: 'warning',
  DRAFT_SHARED: 'purple',
  FINALIZED: 'success',
  EXCUSED: 'neutral',
  // Template lifecycle
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
  // Cycle lifecycle
  PLANNED: 'neutral',
  OPEN: 'blue',
  CONSOLIDATING: 'teal',
  CLOSED: 'neutral',
  // Cycle issues
  RESOLVED: 'success',
  WAIVED: 'neutral',
  // Evaluator assignments
  PENDING: 'neutral',
  SUBMITTED: 'success',
  // Development actions
  RECOMMENDED: 'blue',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXECUTED: 'teal',
}

/** Status chip in the shared StatusPill visual language: colored dot + humanized label. */
export function PerformanceStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = TONES[STATUS_TONE[status] ?? 'neutral']
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', className)}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
      {humanizeEnum(status)}
    </span>
  )
}
