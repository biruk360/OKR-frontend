import { prisma } from '@/lib/prisma'
import { apiNotFound, apiSuccess } from '@/lib/api'
import { withPortalProject } from '@/lib/api/withPortalAuth'
import {
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
  const [project, users, delays, raidItems, reports] = await Promise.all([
    prisma.project.findFirst({
      where: { ...portalProjectWhere(session.user.projectIds), id: params.id },
      include: projectPortalInclude,
    }),
    prisma.user.findMany({ where: { isActive: true }, select: { name: true } }),
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
  const forbiddenEmployeeNames = users.map((u) => u.name).filter(Boolean) as string[]
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
