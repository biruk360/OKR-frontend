import { notFound, redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveParams } from '@/lib/resolve-route-params'
import { SprintReportClient } from '@/features/sprints/components/SprintReportClient'
import { loadSprintReportAccess } from '@/features/sprints/services/sprint-pages.server'

interface Props {
  params: { id: string } | Promise<{ id: string }>
}

export default async function SprintReportPage({ params }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const { id } = await resolveParams(params)
  if (!id) notFound()

  // CPM-9 view gate (canViewSprint); renders not-found when missing or denied.
  const { canEdit, canDelete } = await loadSprintReportAccess(session.user, id)

  return (
    <SprintReportClient
      sprintId={id}
      currentUserId={session.user.id}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  )
}
