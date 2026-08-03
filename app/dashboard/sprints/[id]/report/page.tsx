import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { canEditSprint, canDeleteSprint, type UserRole } from '@/lib/permissions'
import { SprintReportClient } from '@/features/sprints/components/SprintReportClient'

interface Props {
  params: { id: string } | Promise<{ id: string }>
}

export default async function SprintReportPage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
  })
  if (!sprint) notFound()

  const role = session.user.role as UserRole
  const ctx = {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  }
  const canEdit = await canEditSprint(role, session.user.id, ctx)
  const canDelete = (await canDeleteSprint(role, session.user.id, ctx)) || sprint.ownerId === session.user.id

  return (
    <SprintReportClient
      sprintId={id}
      currentUserId={session.user.id}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  )
}
