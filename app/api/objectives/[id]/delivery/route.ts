import { prisma } from '@/lib/prisma'
import { canViewObjective } from '@/lib/permissions'
import { getReadableProject } from '@/lib/projects/access'
import { apiSuccess, apiForbidden, apiNotFound, apiBadRequest, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

/**
 * GET /api/objectives/[id]/delivery
 *
 * Returns the projects linked to this objective with delivery health metrics.
 * Permission: the user must be able to view the objective, and must have read
 * access to each individual project (handled by getReadableProject).
 */

export const GET = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const objective = await prisma.objective.findUnique({
    where: { id },
    select: { level: true, ownerId: true, departmentId: true, isPrivate: true },
  })
  if (!objective) return apiNotFound('Objective not found')

  const visibility = await canViewObjective(session.user.role as any, session.user.id, {
    level: objective.level,
    ownerId: objective.ownerId,
    departmentId: objective.departmentId,
    isPrivate: objective.isPrivate,
  })
  if (!visibility.canView) return apiForbidden('Access denied')

  const projects = await prisma.project.findMany({
    where: { objectiveId: id, archivedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      clientName: true,
      status: true,
      ragStatus: true,
      percentComplete: true,
      percentPlanned: true,
      spi: true,
      cpi: true,
      contractValue: true,
      projectManagerId: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  const visibleProjects = []
  for (const project of projects) {
    const access = await getReadableProject(session, project.id)
    if (access) {
      visibleProjects.push(project)
    }
  }

  const pmIds = Array.from(new Set(visibleProjects.map((p) => p.projectManagerId).filter(Boolean)))
  const users =
    pmIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: pmIds } },
          select: { id: true, name: true },
        })
      : []
  const userNames = new Map(users.map((u) => [u.id, u.name]))

  return apiSuccess(
    visibleProjects.map((p) => ({
      ...p,
      projectManagerName: userNames.get(p.projectManagerId) ?? null,
    })),
  )
})
