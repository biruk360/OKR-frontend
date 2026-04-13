import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SprintsListClient } from '@/features/sprints'

export default async function SprintsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const sprints = await prisma.sprint.findMany({
    where: { status: 'ACTIVE' },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      _count: { select: { activities: true, columns: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const rows = sprints.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    ownerName: s.owner.name,
    ownerAvatar: s.owner.avatar,
    startDate: s.startDate?.toISOString() ?? null,
    endDate: s.endDate?.toISOString() ?? null,
    activitiesCount: s._count.activities,
    columnsCount: s._count.columns,
    isOwn: s.ownerId === session.user.id,
  }))

  return <SprintsListClient sprints={rows} />
}
