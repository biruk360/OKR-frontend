import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import TimelineBoard from './TimelineBoard'

export const dynamic = 'force-dynamic'

export default async function TimelinePage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  // Pull all active objectives with their KRs inlined. Keep the payload small
  // so the client-side board can render without additional fetches.
  const objectives = await prisma.objective.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: { select: { id: true, name: true, startDate: true, endDate: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          progress: true,
          confidence: true,
        },
      },
    },
  })

  const rows = objectives.map((o) => {
    const start = o.startDate ?? o.timeframe?.startDate ?? null
    const end = o.endDate ?? o.timeframe?.endDate ?? null
    return {
      id: o.id,
      title: o.title,
      level: o.level,
      goalStatus: o.goalStatus,
      progress: o.progress,
      startDate: start ? start.toISOString() : null,
      endDate: end ? end.toISOString() : null,
      ownerName: o.owner.name ?? '—',
      keyResults: o.keyResults,
    }
  })

  return (
    <div className="space-y-3">
      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Schedule</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
            Timeline
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Schedule of all active objectives across quarters.</p>
        </div>
      </section>
      <section className="rounded-[14px] border bg-card overflow-hidden" style={{ borderColor: 'var(--ap-border)' }}>
        <TimelineBoard rows={rows} />
      </section>
    </div>
  )
}
