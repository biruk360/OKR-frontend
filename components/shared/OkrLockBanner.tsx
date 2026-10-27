import { LockKeyhole } from 'lucide-react'

interface OkrLockBannerProps {
  entityType: 'Objective' | 'Key Result'
  reopenCount?: number
  closedAt?: Date | string | null
  /**
   * `banner` (default): full-width notice. `rail`: compact "Closed & locked"
   * status card for a detail page's right rail (KR / objective detail), which
   * stacks below the main column on narrow screens.
   */
  variant?: 'banner' | 'rail'
}

function reopenHint(reopenCount: number): string {
  return reopenCount > 0
    ? `Reopened ${reopenCount} time${reopenCount === 1 ? '' : 's'}; the audit scars are permanent.`
    : 'Reopening requires a reason and creates a permanent audit scar.'
}

export default function OkrLockBanner({ entityType, reopenCount = 0, closedAt, variant = 'banner' }: OkrLockBannerProps) {
  const closedLabel = closedAt ? new Date(closedAt).toLocaleDateString() : null

  if (variant === 'rail') {
    return (
      <section
        aria-label={`${entityType} closed and locked`}
        className="overflow-hidden rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)]"
      >
        <h3 className="flex items-center gap-1.5 border-b border-[var(--ap-border)] px-4 py-2.5 text-micro font-semibold uppercase tracking-wide text-[var(--ap-fg-subtle)]">
          <LockKeyhole className="size-3.5" aria-hidden />
          Closed &amp; locked
        </h3>
        <div className="space-y-1 px-4 py-3 text-xs">
          <p className="font-medium text-[var(--ap-fg)]">
            {entityType} is closed{closedLabel ? ` · ${closedLabel}` : ''}
          </p>
          <p className="text-[var(--ap-fg-muted)]" title="Fields, check-ins, labels, contributors, and the retrospective are frozen. Comments and roll-forward remain available.">
            {reopenHint(reopenCount)}
          </p>
        </div>
      </section>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-muted/50 p-4">
      <div className="flex items-start gap-3">
        <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-foreground">{entityType} closed and locked</p>
          <p className="mt-1 text-sm text-muted-foreground">Fields, check-ins, labels, contributors, and the retrospective are frozen. Comments and roll-forward remain available.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {closedLabel ? `Closed ${closedLabel}. ` : ''}
            {reopenHint(reopenCount)}
          </p>
        </div>
      </div>
    </div>
  )
}
