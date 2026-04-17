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
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-foreground">OKR Timeline</h1>
        <p className="text-sm text-muted-foreground">Schedule of all active objectives across quarters.</p>
      </header>
      <TimelineBoard rows={rows} />
    </div>
  )
}
