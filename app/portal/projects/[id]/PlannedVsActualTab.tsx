import { CalendarRange, Flag } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import { PLANNED_VS_ACTUAL_SEVERE_SLIP_DAYS, type PlannedVsActualSummary } from '@/lib/projects/portal-planned-vs-actual'
import type { ClientPlannedVsActual, ClientPlannedVsActualRow } from '@/features/projects/services/portal-serializer'

/**
 * Portal "Planned vs Actual" tab. Renders a DTO that already went through the
 * portal serializer — no raw rows, no employee identities (invariant 4).
 */
export default function PlannedVsActualTab({ data }: { data: ClientPlannedVsActual }) {
  const baselined = data.baselineCommittedAt !== null
  return (
    <>
      <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-section-title text-ink-primary">Planned vs Actual</h2>
            <p className="mt-1 text-body-sm text-ink-secondary">
              Agreed baseline dates against the current plan. Slip is counted in calendar days from the baseline finish.
            </p>
          </div>
          <span className="rounded-pill bg-surface-muted px-3 py-1 text-caption font-medium text-ink-secondary">
            {baselined ? `Baseline v${data.baselineVersion} · ${formatShortDate(data.baselineCommittedAt)}` : 'Not yet baselined'}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SummaryCard label="Milestones" summary={data.milestoneSummary} />
          <SummaryCard label="Activities" summary={data.activitySummary} />
        </div>
      </section>

      <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
        <h2 className="text-section-title text-ink-primary">Milestones</h2>
        {data.milestones.length === 0 ? (
          <EmptyState bare className="mt-4" icon={<Flag className="size-6" />} title="No milestones yet" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-body-sm">
              <thead className="text-ink-tertiary">
                <tr className="border-b border-ink-primary/[0.08]">
                  <th className="py-2 pr-4 font-semibold">Milestone</th>
                  <th className="py-2 pr-4 font-semibold">Phase</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-semibold">Baseline due</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-semibold">Current due</th>
                  <th className="py-2 pr-4 font-semibold">Slip</th>
                  <th className="py-2 pr-4 font-semibold">Complete</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.milestones.map((row) => (
                  <tr key={row.id} className="border-b border-ink-primary/[0.06] last:border-0">
                    <td className="py-3 pr-4 text-ink-primary">{row.name}</td>
                    <td className="py-3 pr-4 text-ink-secondary">{row.phaseName}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-secondary">{formatShortDate(row.baselineEnd)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-secondary">{formatShortDate(row.currentEnd)}</td>
                    <td className="py-3 pr-4"><SlipBadge row={row} /></td>
                    <td className="py-3 pr-4 text-ink-secondary">{Math.round(row.percentComplete)}%</td>
                    <td className="py-3 pr-4 text-ink-secondary">{formatConstant(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-card bg-surface-card p-6 shadow-card">
        <h2 className="text-section-title text-ink-primary">Activities</h2>
        {data.activities.length === 0 ? (
          <EmptyState bare className="mt-4" icon={<CalendarRange className="size-6" />} title="No activities yet" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-body-sm">
              <thead className="text-ink-tertiary">
                <tr className="border-b border-ink-primary/[0.08]">
                  <th className="py-2 pr-4 font-semibold">Activity</th>
                  <th className="py-2 pr-4 font-semibold">Owner</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-semibold">Baseline</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-semibold">Current plan</th>
                  <th className="py-2 pr-4 font-semibold">Slip</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.activities.map((row) => (
                  <tr key={row.id} className="border-b border-ink-primary/[0.06] last:border-0">
                    <td className="max-w-[320px] py-3 pr-4">
                      <div className="truncate text-ink-primary">{row.name}</div>
                      <div className="truncate text-caption text-ink-tertiary">{row.phaseName} · {row.milestoneName}</div>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-secondary">{row.owner}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-secondary">{formatRange(row.baselineStart, row.baselineEnd)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-secondary">{formatRange(row.currentStart, row.currentEnd)}</td>
                    <td className="py-3 pr-4"><SlipBadge row={row} /></td>
                    <td className="whitespace-nowrap py-3 pr-4 text-ink-secondary">
                      {formatConstant(row.status)} · {Math.round(row.percentComplete)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function SummaryCard({ label, summary }: { label: string; summary: PlannedVsActualSummary }) {
  return (
    <div className="rounded-card border border-ink-primary/[0.08] p-4">
      <div className="text-body-sm text-ink-tertiary">{label}</div>
      <div className="mt-2 flex flex-wrap gap-2 text-caption font-semibold">
        <span className="rounded-pill bg-success-50 px-2 py-1 text-success-700">{summary.onTime + summary.ahead} on plan</span>
        <span className={cn('rounded-pill px-2 py-1', summary.slipped > 0 ? 'bg-warning-50 text-warning-700' : 'bg-surface-muted text-ink-secondary')}>
          {summary.slipped} slipped{summary.slipped > 0 ? ` · max +${summary.maxSlipDays}d` : ''}
        </span>
        {summary.notBaselined > 0 && (
          <span className="rounded-pill bg-surface-muted px-2 py-1 text-ink-secondary">{summary.notBaselined} not baselined</span>
        )}
      </div>
    </div>
  )
}

function SlipBadge({ row }: { row: ClientPlannedVsActualRow }) {
  if (row.slipState === 'NOT_BASELINED' || row.varianceDays === null) {
    return <span className="text-ink-tertiary">-</span>
  }
  const days = row.varianceDays
  const label = row.slipState === 'ON_TIME' ? 'On time' : row.slipState === 'AHEAD' ? `${Math.abs(days)}d ahead` : `+${days}d`
  const tone = row.slipState !== 'SLIPPED'
    ? 'bg-success-50 text-success-700'
    : days > PLANNED_VS_ACTUAL_SEVERE_SLIP_DAYS
      ? 'bg-danger-50 text-danger-700'
      : 'bg-warning-50 text-warning-700'
  return <span className={cn('whitespace-nowrap rounded-pill px-2 py-1 text-caption font-semibold', tone)}>{label}</span>
}

function formatShortDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return '-'
  return `${formatShortDate(start)} - ${formatShortDate(end)}`
}

function formatConstant(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}
