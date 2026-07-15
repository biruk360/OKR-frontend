import { prisma } from '@/lib/prisma'
import { apiSuccess } from '@/lib/api'
import { withPortalAuth } from '@/lib/api/withPortalAuth'
import { projectPortalInclude } from '@/features/projects/services/portal-project-query'
import { portalProjectWhere, serializeProjectForClient } from '@/features/projects/services/portal-serializer'

export const GET = withPortalAuth(async (_req, { session }) => {
  const [projects, users] = await Promise.all([
    prisma.project.findMany({
      where: portalProjectWhere(session.user.projectIds),
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: projectPortalInclude,
    }),
    prisma.user.findMany({ where: { isActive: true }, select: { name: true } }),
  ])
  const forbiddenEmployeeNames = users.map((u) => u.name).filter(Boolean)
  return apiSuccess(projects.map((project) => serializeProjectForClient(project, { forbiddenEmployeeNames })))
})
