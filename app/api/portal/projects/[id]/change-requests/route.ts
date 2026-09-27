import { prisma } from '@/lib/prisma'
import { apiNotFound, apiSuccess } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import {
  loadPortalForbiddenNames,
  portalChangeRequestWhere,
  portalProjectWhere,
  serializeChangeRequestForClient,
} from '@/features/projects/services/portal-serializer'

/**
 * GET /api/portal/projects/[id]/change-requests — change requests the PM has
 * shared with the client. The project is first pinned to a portal-enabled
 * project in this session's scope; change requests are then read with
 * `portalChangeRequestWhere` (`projectId` + `visibility: 'CLIENT_VISIBLE'`),
 * so INTERNAL rows are filtered in SQL (invariant 5). Output goes only through
 * the portal serializer: no requester/approver names, no cost (invariant 4).
 */
export const GET = withPortalProject<{ id: string }>(async (_req, { session, params }) => {
  const project = await prisma.project.findFirst({
    where: { ...portalProjectWhere(session.user.projectIds), id: params.id },
    select: { id: true },
  })
  if (!project) return apiNotFound('Project not found')

  const [changeRequests, forbiddenEmployeeNames] = await Promise.all([
    prisma.changeRequest.findMany({
      where: portalChangeRequestWhere(project.id),
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        crCode: true,
        title: true,
        description: true,
        type: true,
        requestedByParty: true,
        requestDate: true,
        scheduleImpactDays: true,
        affectedActivityIds: true,
        status: true,
        ccbDecisionDate: true,
        clientSignOff: true,
        clientSignOffAt: true,
        rejectionReason: true,
        visibility: true,
        createdAt: true,
      },
    }),
    loadPortalForbiddenNames(prisma),
  ])
  return apiSuccess(changeRequests.map((cr) => serializeChangeRequestForClient(cr, { forbiddenEmployeeNames })))
})
