import { loadPublicSnapshotPage, type SnapshotActivity } from '@/features/projects/services/snapshot-page.server'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Public project snapshot' }
export const dynamic = 'force-dynamic'

export default async function PublicProjectSnapshotPage({ params }: { params: { snapshotId: string } }) {
  const { report, snapshot } = await loadPublicSnapshotPage(params.snapshotId)
  const project = snapshot.project
  return (
    <main className="min-h-screen bg-surface-app px-4 py-4 text-ink-primary sm:px-6">
      <header className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface-card px-4 py-3 shadow-card">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{project.name}</h1>
          <p className="text-xs text-ink-secondary">{project.code} · {project.clientName} · read-only public snapshot</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <span className="rounded-pill bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">{Math.round(project.percentComplete)}% complete</span>
          <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-xs text-ink-secondary">Captured {new Date(snapshot.capturedAt || report.generatedAt).toLocaleString()}</span>
        </div>
      </header>
      <section className="overflow-hidden rounded-card border border-border bg-surface-card shadow-card" aria-label="Schedule snapshot">
        <div className={cn(ROW_GRID, 'border-b border-border bg-surface-muted/50 text-xs font-semibold uppercase tracking-wide text-ink-secondary')}>
          <div className="px-3 py-2">Schedule</div>
          <div className="px-3 py-2">Timeline</div>
        </div>
        {project.phases.map((phase) => (
          <div key={phase.id}>
            <div className={cn(ROW_GRID, 'border-b border-border bg-surface-muted/70')}>
              <div className="px-3 py-2 text-body-sm font-semibold">{phase.name}</div>
              <div />
            </div>
            {phase.milestones.flatMap((milestone) => milestone.activities).map((activity) => <SnapshotRow key={activity.id} activity={activity} projectStart={new Date(project.plannedStart)} projectEnd={new Date(project.plannedEnd)} />)}
          </div>
        ))}
      </section>
    </main>
  )
}

/** Schedule | timeline split: 50/50 on phones, fixed-min schedule column from `md` up. */
const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[minmax(320px,42%)_1fr]'
/** Eight vertical guide lines that follow the theme (ink at 6%). */
const TIMELINE_GUIDES = 'bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(12.5%-1px),rgb(var(--rgb-ink-primary)_/_0.06)_calc(12.5%-1px),rgb(var(--rgb-ink-primary)_/_0.06)_12.5%)]'

function SnapshotRow({ activity, projectStart, projectEnd }: { activity: SnapshotActivity; projectStart: Date; projectEnd: Date }) {
  const total = Math.max(1, projectEnd.getTime() - projectStart.getTime())
  const start = activity.currentStart ? new Date(activity.currentStart) : null
  const end = activity.currentEnd ? new Date(activity.currentEnd) : null
  const left = start ? Math.max(0, (start.getTime() - projectStart.getTime()) / total * 100) : 0
  const width = start && end ? Math.max(1, (end.getTime() - start.getTime() + 86_400_000) / total * 100) : 0
  return (
    <div className={cn(ROW_GRID, 'min-h-9 border-b border-border text-xs')}>
      <div className={cn('flex min-w-0 items-center gap-2 py-1.5 pr-3', activity.parentActivityId ? 'pl-4 sm:pl-8' : 'pl-3')}>
        <span className="truncate font-medium">{activity.title}</span>
        <span className="ml-auto shrink-0 text-ink-secondary">{Math.round(activity.percentComplete)}%</span>
      </div>
      <div className={cn('relative', TIMELINE_GUIDES)}>
        {start && end && (
          <div
            className="absolute top-2 h-5 truncate rounded border border-primary-500 bg-primary-200 px-1 text-xs leading-5 text-primary-900"
            style={{ left: `${left}%`, width: `${Math.min(100 - left, width)}%` }}
            title={activity.title}
          >
            {activity.title}
          </div>
        )}
      </div>
    </div>
  )
}
