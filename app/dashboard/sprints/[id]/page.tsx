import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams } from '@/lib/resolve-route-params'
import { SprintBoardClient } from '@/features/sprints'
import { assertSprintBoardAccess } from '@/features/sprints/services/sprint-pages.server'

interface Props {
  params: { id: string } | Promise<{ id: string }>
}

export default async function SprintBoardPage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  // CPM-9 view gate (canViewSprint); renders not-found when missing or denied.
  await assertSprintBoardAccess(session.user, id)

  return <SprintBoardClient sprintId={id} currentUserId={session.user.id} />
}
