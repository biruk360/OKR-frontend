import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const existing = await prisma.objective.findUnique({ where: { id } })
  if (!existing) return apiNotFound('Objective not found')
  if (existing.status === 'ARCHIVED') {
    return apiBadRequest('Objective is already archived')
  }

  const allowed = await canEditObjective(
    session.user.role as any,
    session.user.id,
    {
      level: existing.level,
      ownerId: existing.ownerId,
      departmentId: existing.departmentId,
    },
  )
  if (!allowed) return apiForbidden('Insufficient permissions to archive this objective')

  const result = await prisma.$transaction(async (tx) => {
    // Archive the objective and cascade its KRs.
    const updated = await tx.objective.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })
    await tx.keyResult.updateMany({
      where: { objectiveId: id, status: 'ACTIVE' },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    })

    // Parent progress may change now that this subtree no longer counts.
    if (existing.parentObjectiveId) {
      await recalcNodeAndAncestors(tx, existing.parentObjectiveId)
    }
    return updated
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'ARCHIVED',
    actorId: session.user.id,
    metadata: { title: existing.title, level: existing.level },
  })

  return apiSuccess(result, { message: 'Objective archived.' })
})
