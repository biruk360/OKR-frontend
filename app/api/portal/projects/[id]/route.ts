import { prisma } from '@/lib/prisma'
import { apiNotFound, apiSuccess } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import {
  loadPortalForbiddenNames,
  portalProjectWhere,
  portalRaidItemWhere,
  portalReportWhere,
  serializeDelayForClient,
  serializeProjectForClient,
  serializeRaidItemForClient,
  serializeReportForClient,
} from '@/features/projects/services/portal-serializer'
import { awaitingClientActions, portalDelayRows } from '@/features/projects/services/portal-dashboard'
import { projectPortalInclude } from '@/features/projects/services/portal-project-query'

export const GET = withPortalProject<{ id: string }>(async (_req, { session, params }) => {
  const [project, forbiddenEmployeeNames, delays, raidItems, reports] = await Promise.all([
    prisma.project.findFirst({
      where: { ...portalProjectWhere(session.user.projectIds), id: params.id },
      include: projectPortalInclude,
    }),
    loadPortalForbiddenNames(prisma),
    prisma.delayEvent.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.raidItem.findMany({
      where: portalRaidItemWhere(params.id),
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.projectReport.findMany({
      where: portalReportWhere(params.id),
      orderBy: { periodEnd: 'desc' },
    }),
  ])
  if (!project) return apiNotFound('Project not found')
  const projectDto = serializeProjectForClient(project, { forbiddenEmployeeNames })
  const delayDtos = delays.map((delay) => serializeDelayForClient(delay, { forbiddenEmployeeNames }))

  return apiSuccess({
    project: projectDto,
    awaitingActions: awaitingClientActions(projectDto),
    delayRows: portalDelayRows(projectDto, delayDtos),
    raidItems: raidItems.map((item) => serializeRaidItemForClient(item, { forbiddenEmployeeNames })),
    reports: reports.map((report) => serializeReportForClient(report, { forbiddenEmployeeNames })),
  })
})
