import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiBadRequest,
  apiConflict,
  apiNotFound,
  withAuth,
} from '@/lib/api'

type ActParams = { id: string; actId: string } | Promise<{ id: string; actId: string }>

/**
 * Convert a sprint activity into an Initiative (Todo row) linked to a Key Result.
 *
 * Requirements:
 *   - Activity must have a keyResultId (initiatives live under a KR) — if the client
 *     only has an objectiveId link, it must pass `keyResultId` in the body.
 *
 * Behavior:
 *   - Creates the Todo with title/description/assignee copied from the activity
 *   - Stamps convertedInitiativeId on the sprint activity so the UI can show "converted"
 *   - Activity itself is NOT deleted
 */
export const POST = withAuth<ActParams>(async (request: NextRequest, { session, params }) => {
  const { id: sprintId, actId } = await resolveParams(params)
  if (!sprintId || !actId) return apiBadRequest('Invalid id')

  const body = await request.json().catch(() => ({}))

  const activity = await prisma.sprintActivity.findUnique({
    where: { id: actId },
    include: {
      owner: { select: { id: true, name: true } },
      keyResult: { select: { id: true, objectiveId: true } },
    },
  })
  if (!activity || activity.sprintId !== sprintId) {
    return apiNotFound('Activity not found')
  }
  if (activity.convertedInitiativeId) {
    return apiConflict('This activity has already been converted to an initiative')
  }

  const explicitKrId: string | undefined = body.keyResultId
  const keyResultId = explicitKrId || activity.keyResultId
  if (!keyResultId) {
    return apiBadRequest(
      'Initiatives must live under a Key Result. Link the activity to a KR first or pass keyResultId in the request body.'
    )
  }
  const kr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: { id: true, objectiveId: true, status: true },
  })
  if (!kr) return apiNotFound('Key result not found')
  if (kr.status !== 'ACTIVE') return apiBadRequest('Target key result must be active')

  const initiative = await prisma.$transaction(async (tx) => {
    const created = await tx.todo.create({
      data: {
        title: activity.title,
        description: activity.description || '',
        assigneeId: activity.ownerId,
        creatorId: session.user.id,
        keyResultId,
        status: 'PENDING',
        dueDate: activity.dueDate,
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        creator: { select: { id: true, name: true, avatar: true } },
      },
    })
    await tx.sprintActivity.update({
      where: { id: actId },
      data: { convertedInitiativeId: created.id, keyResultId },
    })
    return created
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId,
    objectiveId: kr.objectiveId,
    action: 'INITIATIVE_ADDED',
    actorId: session.user.id,
    metadata: {
      initiativeId: initiative.id,
      title: initiative.title,
      convertedFromSprintActivityId: actId,
    },
  })

  return apiSuccess(initiative, { status: 201 })
})
