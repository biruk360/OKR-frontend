import Link from 'next/link'
import StatusPill, { normalizeStatus } from '@/components/shared/StatusPill'
import { Progress } from '@/components/ui/progress'
import { getProgressBarColor } from '@/lib/utils'
import type { ProgressTrackingData } from '@/lib/okr/insights-data'

/**
 * Insights → Progress → Tracking list (was /dashboard/progress): the viewer's
 * tracked objectives (EMPLOYEE own, DEPARTMENT_LEAD own + departments',
 * ADMIN/EXECUTIVE all) with health KPIs. Data from lib/okr/insights-data.ts
 * `loadProgressTracking`.
 */
export default function ProgressTrackingPanel({ data }: { data: ProgressTrackingData }) {
  const { kpis, objectives } = data
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="On track" value={kpis.onTrack} color="var(--ap-green)" />
        <Kpi label="At risk" value={kpis.atRisk} color="var(--ap-orange)" />
        <Kpi label="Off track" value={kpis.offTrack} color="var(--ap-red)" />
        <Kpi label="Average progress" value={`${kpis.avgProgress}%`} />
      </div>

      <section className="rounded-[var(--ap-radius-md)] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ap-border)' }}>
          <h2 className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            Objectives <span className="ml-1 font-mono normal-case text-muted-foreground">({objectives.length})</span>
          </h2>
        </div>
        {objectives.length === 0 ? (
          <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">No active objectives.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--ap-border)' }}>
            {objectives.map((o) => (
              <li key={o.id} className="px-4 py-3 hover:bg-[color:var(--ap-bg-hover)] transition">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/dashboard/objectives/${o.id}`}
                    className="flex-1 min-w-0 text-body-sm font-medium hover:underline truncate"
                  >
                    {o.title}
                  </Link>
                  <StatusPill status={normalizeStatus(o.goalStatus)} />
                  <span className="text-xs font-mono tabular-nums text-muted-foreground w-10 text-right">
                    {Math.round(o.progress)}%
                  </span>
                </div>
                <Progress
                  className="mt-2"
                  value={Math.min(100, o.progress)}
                  fill={getProgressBarColor(o.progress)}
                  aria-label="Objective progress"
                />
                <div className="mt-1.5 flex items-center gap-3 text-caption text-muted-foreground">
                  <span>{o.ownerName ?? 'Unowned'}</span>
                  <span>·</span>
                  <span>{o.keyResultCount} KRs</span>
                  <span>·</span>
                  <span>{o.timeframeName}</span>
                  {o.departmentName && (<><span>·</span><span>{o.departmentName}</span></>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Kpi({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-[var(--ap-radius-md)] border bg-card px-4 py-4" style={{ borderColor: 'var(--ap-border)' }}>
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1.5 text-page-title font-semibold tabular-nums leading-none"
        style={{ letterSpacing: '-0.02em', color: color ?? 'var(--ap-fg)' }}
      >
        {value}
      </p>
    </div>
  )
}
