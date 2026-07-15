import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { getWritableProject } from '@/lib/projects/access'
import { syncActiveJiraConnections } from '@/features/projects/services/jira/sync'

export const POST = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { jiraConnectionId: true },
  })
  if (!project?.jiraConnectionId) return apiBadRequest('Project is not linked to Jira.')

  const result = await syncActiveJiraConnections({
    trigger: 'MANUAL',
    connectionId: project.jiraConnectionId,
  })
  return apiSuccess(result, { message: 'Jira sync completed.' })
})
