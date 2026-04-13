import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  withAuth,
} from '@/lib/api'

/**
 * Request a check-in from the objective owner. Creates a notification +
 * logs the request on the objective activity feed. Deduped 24h per requester.
 */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const obj = await prisma.objective.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ownerId: true,
      owner: { select: { id: true, name: true } },
    },
  })
  if (!obj) return apiNotFound('Objective not found')

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const existing = await prisma.notification.findFirst({
    where: {
      userId: obj.ownerId,
      type: 'REMINDER',
      isRead: false,
      createdAt: { gte: yesterday },
      metadata: { contains: `"objectiveId":"${id}"` },
    },
  })

  if (!existing) {
    await prisma.notification.create({
      data: {
        userId: obj.ownerId,
        type: 'REMINDER',
        title: 'Check-in requested',
        message: `${session.user.name || 'A teammate'} requested a check-in on "${obj.title}".`,
        metadata: JSON.stringify({
          kind: 'CHECKIN_REQUEST',
          objectiveId: id,
          requestedBy: session.user.id,
        }),
      },
    })
  }

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'CHECKIN_REQUESTED',
    actorId: session.user.id,
    metadata: { ownerId: obj.ownerId },
  })

  return apiSuccess(
    { notified: obj.ownerId, deduped: Boolean(existing) },
    { message: existing ? 'Already requested within the last 24 hours.' : 'Check-in requested.' },
  )
})
