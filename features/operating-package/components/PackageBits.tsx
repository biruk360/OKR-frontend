'use client'

import { MiniBadge, type MiniBadgeTone } from '@/components/ui'
import { chartColors } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'
import { PACKAGE_STATUS_LABELS, type PackageStatus, type PackageWeights, type ReviewVerdict } from '@/types/package'
import { weightSegments } from '../services/rules'
import type { PackageReviewSummary } from '../types'

const STATUS_TONE: Record<PackageStatus, MiniBadgeTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'accent',
  APPROVED: 'ok',
  ARCHIVED: 'neutral',
}

export function PackageStatusBadge({ status, className }: { status: PackageStatus; className?: string }) {
  return (
    <MiniBadge tone={STATUS_TONE[status]} className={className}>
      {PACKAGE_STATUS_LABELS[status]}
    </MiniBadge>
  )
}

export function ReviewVerdictBadge({
  verdict,
  resolved,
  className,
  title,
}: {
  verdict: ReviewVerdict
  resolved?: boolean
  className?: string
  title?: string
}) {
  const tone: MiniBadgeTone = verdict === 'AGREE' ? 'ok' : resolved ? 'neutral' : 'warn'
  return (
    <MiniBadge tone={tone} className={className} title={title}>
      {verdict === 'AGREE' ? 'Agreed' : resolved ? 'Dispute resolved' : 'Disputed'}
    </MiniBadge>
  )
}

/** "n of m reviewed · k disputes open" (PKG-2). */
export function formatReviewSummary(summary: PackageReviewSummary): string {
  const base = `${summary.reviewed} of ${summary.total} reviewed`
  if (summary.disputesOpen === 0) return base
  return `${base} · ${summary.disputesOpen} dispute${summary.disputesOpen === 1 ? '' : 's'} open`
}

/** Categorical marks for the mix bar — chart tokens only (lib/chart-colors). */
const SEGMENT_COLORS = [
  chartColors.accent,
  chartColors.success,
  chartColors.warning,
  chartColors.accentLight,
  chartColors.successDark,
  chartColors.warningLight,
  chartColors.neutralStrong,
]

/** PKG-4: the performance mix as a stacked bar with a legend. Informational only. */
export function WeightsMix({ weights, className }: { weights: PackageWeights; className?: string }) {
  const segments = weightSegments(weights)
  if (segments.length === 0) return null
  return (
    <div className={cn('space-y-2', className)}>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--ap-bg-sunken)]"
        role="img"
        aria-label={`Performance mix: ${segments.map((s) => `${s.label} ${s.value}%`).join(', ')}`}
      >
        {segments.map((segment, index) =>
          segment.percent > 0 ? (
            <span
              key={segment.key}
              className="h-full"
              style={{ width: `${segment.percent}%`, background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment, index) => (
          <li key={segment.key} className="inline-flex items-center gap-1.5 text-caption text-[var(--ap-fg-muted)]">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
            />
            {segment.label}
            <span className="font-medium tabular-nums text-[var(--ap-fg)]">{segment.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
