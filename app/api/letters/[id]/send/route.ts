import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { canCreateLetter, canDispatchLetter } from '@/lib/permissions'
import { notifyLetterSent } from '@/lib/letters-notify'
import { LetterDispatchMethod } from '@/types'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

const METHODS: LetterDispatchMethod[] = ['EMAIL', 'PRINTED', 'COURIER']

// FR-11: Mark as Sent — APPROVED → SENT, captures dispatch method + tracking.
export const POST = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  if (!canCreateLetter(session.user.role) && !canDispatchLetter(session.user.role)) {
    return apiForbidden('You are not permitted to dispatch letters')
  }

  const body = (await req.json().catch(() => ({}))) as {
    dispatchMethod?: LetterDispatchMethod
    dispatchDate?: string
    trackingReference?: string
  }
  if (!body.dispatchMethod || !METHODS.includes(body.dispatchMethod)) {
    return apiBadRequest('Dispatch method is required')
  }
  const dispatchDate = body.dispatchDate ? new Date(body.dispatchDate) : new Date()
  if (Number.isNaN(dispatchDate.getTime())) return apiBadRequest('Invalid dispatch date')

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  if (letter.status !== 'APPROVED') return apiBadRequest('Only APPROVED letters can be marked as sent')

  // FR-validation: letter date cannot be future-dated at time of Sent.
  if (letter.date.getTime() > Date.now()) {
    return apiBadRequest('Letter date is in the future; cannot mark as sent')
  }

  const updated = await prisma.letter.update({
    where: { id },
    data: {
      status: 'SENT',
      dispatchMethod: body.dispatchMethod,
      dispatchDate,
      trackingReference: body.trackingReference ?? null,
    },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'LETTER_SENT',
    actorId: session.user.id,
    metadata: {
      referenceNumber: letter.referenceNumber,
      dispatchMethod: body.dispatchMethod,
      dispatchDate: dispatchDate.toISOString(),
      trackingReference: body.trackingReference ?? null,
    },
  })
  await notifyLetterSent(session.user.id, updated)
  return apiSuccess(updated)
})
