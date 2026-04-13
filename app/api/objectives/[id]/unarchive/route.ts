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
  if (existing.status !== 'ARCHIVED') {
    return apiBadRequest('Objective is not archived')
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
  if (!allowed) return apiForbidden('Insufficient permissions to restore this objective')

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.objective.update({
      where: { id },
      data: { status: 'ACTIVE', archivedAt: null },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })
    // Note: we do NOT auto-unarchive KRs — the caller re-enables them selectively.
    if (existing.parentObjectiveId) {
      await recalcNodeAndAncestors(tx, existing.parentObjectiveId)
    }
    return updated
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'UNARCHIVED',
    actorId: session.user.id,
    metadata: { title: existing.title, level: existing.level },
  })

  return apiSuccess(result, { message: 'Objective restored.' })
})
