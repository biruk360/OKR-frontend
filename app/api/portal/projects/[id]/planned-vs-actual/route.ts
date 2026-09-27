import { prisma } from '@/lib/prisma'
import { apiNotFound, apiSuccess } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import {
  loadPortalForbiddenNames,
  portalProjectWhere,
  serializePlannedVsActualForClient,
} from '@/features/projects/services/portal-serializer'
import { projectPortalInclude } from '@/features/projects/services/portal-project-query'

/**
 * GET — Planned vs Actual (baseline vs current dates + signed slip) for every
 * milestone and activity of a portal-enabled project in the session scope.
 * Same project tree and scoping as GET /api/portal/projects/[id]; output only
 * through the portal serializer (invariant 4).
 */
export const GET = withPortalProject<{ id: string }>(async (_req, { session, params }) => {
  const [project, forbiddenEmployeeNames] = await Promise.all([
    prisma.project.findFirst({
      where: { ...portalProjectWhere(session.user.projectIds), id: params.id },
      include: projectPortalInclude,
    }),
    loadPortalForbiddenNames(prisma),
  ])
  if (!project) return apiNotFound('Project not found')
  return apiSuccess(serializePlannedVsActualForClient(project, { forbiddenEmployeeNames }))
})
