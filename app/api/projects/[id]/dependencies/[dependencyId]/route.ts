import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const DELETE = withAuth<{ id: string; dependencyId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const dependency = await prisma.activityDependency.findFirst({
    where: { id: params.dependencyId, predecessor: { milestone: { phase: { projectId: params.id } } } },
  })
  if (!dependency) return apiNotFound('Dependency not found')

  await prisma.activityDependency.delete({ where: { id: params.dependencyId } })
  await recordActivity({
    entityType: 'PROJECT_ACTIVITY',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: {
      dependencyId: dependency.id,
      kind: 'DEPENDENCY_DELETED',
      predecessorId: dependency.predecessorId,
      successorId: dependency.successorId,
      type: dependency.type,
    },
  })

  return apiSuccess({ id: params.dependencyId, deleted: true })
})
