import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { objectiveLockResponse } from '@/lib/okr/lock-guard'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { emit } from '@/lib/notifications'
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

  const locked = await objectiveLockResponse(id)
  if (locked) return locked
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

  await emit('OBJECTIVE_ARCHIVED', {
    actorId: session.user.id,
    entityType: 'OBJECTIVE', entityId: id, entityTitle: existing.title,
    isPrivate: existing.isPrivate,
    data: { actorName: session.user.name, deepLink: `/dashboard/objectives/${id}` },
  })

  // If any children were orphaned, notify their owners.
  const orphans = await prisma.objective.findMany({
    where: { parentObjectiveId: id, status: 'ACTIVE' },
    select: { id: true, ownerId: true, title: true, isPrivate: true },
  })
  for (const child of orphans) {
    await emit('PARENT_OBJECTIVE_ARCHIVED_ORPHAN', {
      actorId: session.user.id,
      entityType: 'OBJECTIVE', entityId: child.id, entityTitle: child.title,
      isPrivate: child.isPrivate,
      data: { orphanedObjectiveId: child.id, actorName: session.user.name, deepLink: `/dashboard/objectives/${child.id}` },
    })
  }

  return apiSuccess(result, { message: 'Objective archived.' })
})
