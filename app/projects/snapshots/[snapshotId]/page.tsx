import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

interface SnapshotActivity { id: string; parentActivityId: string | null; title: string; currentStart: string | Date | null; currentEnd: string | Date | null; status: string; percentComplete: number; priority: string | null; risk: string | null; isBlocked: boolean }
interface SnapshotData { capturedAt: string; project: { code: string; name: string; clientName: string; plannedStart: string | Date; plannedEnd: string | Date; ragStatus: string; percentComplete: number; phases: Array<{ id: string; name: string; milestones: Array<{ id: string; name: string; activities: SnapshotActivity[] }> }> } }

export const metadata = { title: 'Public project snapshot' }
export const dynamic = 'force-dynamic'

export default async function PublicProjectSnapshotPage({ params }: { params: { snapshotId: string } }) {
  const report = await prisma.projectReport.findFirst({ where: { id: params.snapshotId, type: 'PUBLIC_SNAPSHOT', status: 'APPROVED' }, select: { contentJson: true, generatedAt: true } })
  if (!report) notFound()
  const snapshot = report.contentJson as unknown as SnapshotData
  const project = snapshot.project
  return (
    <main className="min-h-screen bg-[#f5f6f8] p-4 text-ink-primary">
      <header className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-black/[0.08] bg-white px-4 py-3 shadow-card">
        <div><h1 className="text-[18px] font-semibold">{project.name}</h1><p className="text-[11px] text-ink-tertiary">{project.code} · {project.clientName} · read-only public snapshot</p></div>
        <span className="ml-auto rounded-pill bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700">{Math.round(project.percentComplete)}% complete</span>
        <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-[11px] text-ink-secondary">Captured {new Date(snapshot.capturedAt || report.generatedAt).toLocaleString()}</span>
      </header>
      <section className="overflow-hidden rounded-card border border-black/[0.08] bg-white shadow-card">
        <div className="grid grid-cols-[minmax(320px,42%)_1fr] border-b border-black/[0.08] bg-surface-muted/50 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary"><div className="px-3 py-2">Schedule</div><div className="px-3 py-2">Timeline</div></div>
        {project.phases.map((phase) => (
          <div key={phase.id}>
            <div className="grid grid-cols-[minmax(320px,42%)_1fr] border-b border-black/[0.08] bg-surface-muted/70"><div className="px-3 py-2 text-body-sm font-semibold">{phase.name}</div><div /></div>
            {phase.milestones.flatMap((milestone) => milestone.activities).map((activity) => <SnapshotRow key={activity.id} activity={activity} projectStart={new Date(project.plannedStart)} projectEnd={new Date(project.plannedEnd)} />)}
          </div>
        ))}
      </section>
    </main>
  )
}

function SnapshotRow({ activity, projectStart, projectEnd }: { activity: SnapshotActivity; projectStart: Date; projectEnd: Date }) {
  const total = Math.max(1, projectEnd.getTime() - projectStart.getTime())
  const start = activity.currentStart ? new Date(activity.currentStart) : null
  const end = activity.currentEnd ? new Date(activity.currentEnd) : null
  const left = start ? Math.max(0, (start.getTime() - projectStart.getTime()) / total * 100) : 0
  const width = start && end ? Math.max(1, (end.getTime() - start.getTime() + 86_400_000) / total * 100) : 0
  return <div className="grid min-h-9 grid-cols-[minmax(320px,42%)_1fr] border-b border-black/[0.04] text-[12px]"><div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: activity.parentActivityId ? 30 : 12 }}><span className="truncate font-medium">{activity.title}</span><span className="ml-auto text-[10px] text-ink-tertiary">{Math.round(activity.percentComplete)}%</span></div><div className="relative bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(12.5%-1px),rgba(0,0,0,0.05)_calc(12.5%-1px),rgba(0,0,0,0.05)_12.5%)]">{start && end && <div className="absolute top-2 h-5 truncate rounded border border-primary-500 bg-sky-200 px-1 text-[10px] leading-5 text-primary-900" style={{ left: `${left}%`, width: `${Math.min(100 - left, width)}%` }}>{activity.title}</div>}</div></div>
}
