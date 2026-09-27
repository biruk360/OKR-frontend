'use client'

import { cn } from '@/lib/utils'

/** Humanizes a raw enum value: "DRAFT_SHARED" → "Draft shared". */
export function humanizeEnum(value: string): string {
  const text = value.replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

type Tone = { bg: string; fg: string; dot: string }

// Semantic --ap-* status pairs (tint bg / readable fg / solid dot) so every tone
// follows dark mode. Teal has no status token, so it is derived from the sky
// label swatch: a translucent wash plus a fg mixed toward --ap-fg for contrast.
const TONES: Record<string, Tone> = {
  blue: { bg: 'var(--ap-accent-soft)', fg: 'var(--ap-accent-on-soft)', dot: 'var(--ap-accent)' },
  teal: {
    bg: 'color-mix(in oklab, var(--ap-card-sky) 16%, transparent)',
    fg: 'color-mix(in oklab, var(--ap-card-sky) 45%, var(--ap-fg))',
    dot: 'var(--ap-card-sky)',
  },
  purple: { bg: 'var(--ap-ahead-bg)', fg: 'var(--ap-ahead-fg)', dot: 'var(--ap-ahead)' },
  warning: { bg: 'var(--ap-warn-bg)', fg: 'var(--ap-warn-fg)', dot: 'var(--ap-warn)' },
  success: { bg: 'var(--ap-ok-bg)', fg: 'var(--ap-ok-fg)', dot: 'var(--ap-ok)' },
  danger: { bg: 'var(--ap-danger-bg)', fg: 'var(--ap-danger-fg)', dot: 'var(--ap-danger)' },
  neutral: { bg: 'var(--ap-none-bg)', fg: 'var(--ap-none-fg)', dot: 'var(--ap-none)' },
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
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-semibold', className)}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: tone.dot }} />
      {humanizeEnum(status)}
    </span>
  )
}
