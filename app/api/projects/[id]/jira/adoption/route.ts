import { prisma } from '@/lib/prisma'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { getReadableProject } from '@/lib/projects/access'
import { getJiraAdoption } from '@/features/projects/services/jira/adoption'

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  return apiSuccess(await getJiraAdoption(prisma, params.id))
})
