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
 * Request a check-in from the KR owner. Creates a notification + logs the request
 * on the KR activity feed. Rate-limited to one request per requester/KR per 24h to
 * avoid nagging.
 */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const kr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      objectiveId: true,
      owner: { select: { id: true, name: true } },
    },
  })
  if (!kr) return apiNotFound('Key result not found')

  // Dedupe: don't create a duplicate unread request within the last 24h from same user.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const existing = await prisma.notification.findFirst({
    where: {
      userId: kr.ownerId,
      type: 'REMINDER',
      isRead: false,
      createdAt: { gte: yesterday },
      metadata: { contains: `"keyResultId":"${keyResultId}"` },
    },
  })

  if (!existing) {
    await prisma.notification.create({
      data: {
        userId: kr.ownerId,
        type: 'REMINDER',
        title: 'Check-in requested',
        message: `${session.user.name || 'A teammate'} requested a check-in on "${kr.title}".`,
        metadata: JSON.stringify({
          kind: 'CHECKIN_REQUEST',
          keyResultId,
          objectiveId: kr.objectiveId,
          requestedBy: session.user.id,
        }),
      },
    })
  }

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId,
    objectiveId: kr.objectiveId,
    action: 'CHECKIN_REQUESTED',
    actorId: session.user.id,
    metadata: { ownerId: kr.ownerId },
  })

  return apiSuccess(
    { notified: kr.ownerId, deduped: Boolean(existing) },
    { message: existing ? 'Already requested within the last 24 hours.' : 'Check-in requested.' },
  )
})
