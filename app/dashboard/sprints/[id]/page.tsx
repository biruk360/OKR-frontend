import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import SprintBoardClient, { type SprintBoardData } from '@/components/sprints/SprintBoardClient'

interface Props {
  params: { id: string } | Promise<{ id: string }>
}

export default async function SprintBoardPage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      columns: {
        orderBy: { position: 'asc' },
        include: {
          activities: {
            orderBy: { position: 'asc' },
            include: {
              owner: { select: { id: true, name: true, avatar: true } },
              keyResult: {
                select: {
                  id: true,
                  title: true,
                  objective: { select: { id: true, title: true } },
                },
              },
              objective: { select: { id: true, title: true } },
              _count: { select: { comments: true, tasks: true } },
              tasks: { select: { status: true } },
            },
          },
        },
      },
    },
  })
  if (!sprint) notFound()

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, avatar: true },
    orderBy: { name: 'asc' },
  })

  // Active KRs + objectives available for linking from cards.
  const [krs, objectives] = await Promise.all([
    prisma.keyResult.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        objective: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    prisma.objective.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, title: true, level: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
  ])

  const data: SprintBoardData = {
    id: sprint.id,
    name: sprint.name,
    description: sprint.description,
    ownerName: sprint.owner.name,
    columns: sprint.columns.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      position: c.position,
      activities: c.activities.map((a) => {
        const tasksTotal = a._count.tasks
        const tasksCompleted = a.tasks.filter((t) => t.status === 'COMPLETED').length
        return {
          id: a.id,
          title: a.title,
          description: a.description,
          ownerId: a.ownerId,
          owner: a.owner,
          keyResultId: a.keyResultId,
          keyResult: a.keyResult,
          objectiveId: a.objectiveId,
          objective: a.objective,
          convertedInitiativeId: a.convertedInitiativeId,
          dueDate: a.dueDate ? a.dueDate.toISOString() : null,
          position: a.position,
          columnId: c.id,
          commentCount: a._count.comments,
          tasksTotal,
          tasksCompleted,
        }
      }),
    })),
  }

  return (
    <SprintBoardClient
      initial={data}
      users={users}
      keyResults={krs}
      objectives={objectives}
      currentUserId={session.user.id}
    />
  )
}
