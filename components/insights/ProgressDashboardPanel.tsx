import Link from 'next/link'
import { Progress } from '@/components/ui/progress'
import type { ProgressDashboardData, StatusRow, StatusSummary } from '@/lib/okr/insights-data'
import ProgressReportWeeklyBars from './ProgressReportWeeklyBars'

/**
 * Insights → Progress → Status dashboard (was /dashboard/progress-report):
 * snapshot of where every active OKR the viewer can see stands. Data from
 * lib/okr/insights-data.ts `loadProgressDashboard`.
 */
export default function ProgressDashboardPanel({ data }: { data: ProgressDashboardData }) {
  return (
    <div className="space-y-3">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SummaryCard title="Objectives" summary={data.objectiveSummary} />
        <SummaryCard title="Key results" summary={data.keyResultSummary} />
      </section>

      <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Statuses over time</h2>
        </div>
        <div className="p-4">
          <ProgressReportWeeklyBars objectives={data.objectiveWeekly} keyResults={data.keyResultWeekly} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <StatusList title="OKRs off track" subtitle={data.offTrack.subtitle} rows={data.offTrack.rows} />
        <StatusList title="OKRs at risk" subtitle={data.atRisk.subtitle} rows={data.atRisk.rows} />
      </section>
    </div>
  )
}

function SummaryCard({ title, summary }: { title: string; summary: StatusSummary }) {
  return (
    <div className="rounded-[var(--ap-radius-md)] border bg-card px-5 py-5" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="flex items-baseline justify-between">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <span className="text-caption tabular-nums text-muted-foreground">{Math.round(summary.completionPct)}% complete</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-page-title font-semibold tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>{summary.completed}</span>
        <span className="text-body-sm text-muted-foreground">/ {summary.total}</span>
      </div>
      <Progress className="mt-3" value={Math.min(100, summary.completionPct)} fill="var(--ap-ok)" aria-label="Completion" />
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Chip label="On track" value={summary.onTrack} bg="color-mix(in oklch, var(--ap-green) 12%, transparent)" fg="var(--ap-green)" />
        <Chip label="At risk" value={summary.atRisk} bg="color-mix(in oklch, var(--ap-orange) 12%, transparent)" fg="var(--ap-orange)" />
        <Chip label="Off track" value={summary.offTrack} bg="color-mix(in oklch, var(--ap-red) 12%, transparent)" fg="var(--ap-red)" />
      </dl>
    </div>
  )
}

function Chip({ label, value, bg, fg }: { label: string; value: number; bg: string; fg: string }) {
  return (
    <div className="rounded-[var(--ap-radius-sm)] px-2 py-2 text-center" style={{ background: bg, color: fg }}>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-micro uppercase tracking-wide opacity-90">{label}</div>
    </div>
  )
}

function StatusList({ title, subtitle, rows }: { title: string; subtitle: string; rows: StatusRow[] }) {
  return (
    <div className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">Nothing here. Good news.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
          {rows.map((r) => {
            const color = r.status === 'off-track' ? 'var(--ap-red)' : 'var(--ap-orange)'
            return (
              <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[color:var(--ap-bg-hover)] transition">
                <span
                  className="rounded-full px-1.5 py-0.5 text-micro font-bold uppercase tracking-wide"
                  style={{
                    background: r.kind === 'KR' ? 'var(--ap-accent-soft)' : 'var(--ap-ahead-bg)',
                    color: r.kind === 'KR' ? 'var(--ap-accent)' : 'var(--ap-ahead-fg)',
                  }}
                >
                  {r.kind}
                </span>
                <Link href={r.href} className="flex-1 min-w-0 text-body-sm truncate hover:underline">
                  {r.title}
                </Link>
                <span className="text-xs font-mono tabular-nums w-10 text-right" style={{ color }}>
                  {Math.round(r.progress)}%
                </span>
                <span className="hidden sm:inline text-caption text-muted-foreground truncate w-24 text-right">{r.owner}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
