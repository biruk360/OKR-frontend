import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { SprintBoardClient } from '@/features/sprints'

interface Props {
  params: { id: string } | Promise<{ id: string }>
}

export default async function SprintBoardPage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  const sprint = await prisma.sprint.findUnique({ where: { id }, select: { id: true } })
  if (!sprint) notFound()

  return <SprintBoardClient sprintId={id} currentUserId={session.user.id} />
}
