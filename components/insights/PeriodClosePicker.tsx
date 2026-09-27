'use client'

import Link from 'next/link'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { useTimeframes } from '@/hooks/useTimeframes'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRow } from '@/components/ui/Skeleton'

type TimeframeLike = { id: string; name: string; startDate: string | Date; endDate: string | Date; isActive?: boolean }

function phaseOf(tf: TimeframeLike, now: number): 'ended' | 'current' | 'upcoming' {
  const start = new Date(tf.startDate).getTime()
  const end = new Date(tf.endDate).getTime()
  if (end < now) return 'ended'
  if (start > now) return 'upcoming'
  return 'current'
}

const PHASE_LABEL = { ended: 'Ended', current: 'In progress', upcoming: 'Upcoming' } as const

function fmt(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Insights → Period close: pick a timeframe to open its period-close report
 * (/dashboard/okrs-all/period-report/[timeframeId]). The report itself scopes
 * its rows to what the viewer may see (lib/okr/period-report.ts).
 */
export default function PeriodClosePicker() {
  const { timeframes, isLoading, isError } = useTimeframes()
  const now = Date.now()
  const sorted = [...(timeframes as unknown as TimeframeLike[])].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  )

  return (
    <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Period close reports</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Pick a timeframe to review what closed, what carries over and what is still open.
        </p>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading timeframes">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : isError ? (
        <p className="px-4 py-8 text-center text-body-sm text-[var(--ap-red)]">Could not load timeframes.</p>
      ) : sorted.length === 0 ? (
        <EmptyState bare icon={CalendarCheck} title="No timeframes yet" description="Create a timeframe in Settings → Timeframes." />
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
          {sorted.map((tf) => {
            const phase = phaseOf(tf, now)
            return (
              <li key={tf.id}>
                <Link
                  href={`/dashboard/okrs-all/period-report/${tf.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-[color:var(--ap-bg-hover)]"
                >
                  <CalendarCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-foreground">{tf.name}</span>
                    <span className="block text-caption text-muted-foreground">
                      {fmt(tf.startDate)} – {fmt(tf.endDate)}
                    </span>
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-micro font-semibold uppercase tracking-wide"
                    style={{
                      background: phase === 'current' ? 'var(--ap-accent-soft)' : 'var(--ap-bg-sunken)',
                      color: phase === 'current' ? 'var(--ap-accent)' : 'var(--ap-fg-muted)',
                    }}
                  >
                    {PHASE_LABEL[phase]}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
