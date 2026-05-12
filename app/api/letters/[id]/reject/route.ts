import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { canApproveLetter } from '@/lib/permissions'
import { notifyLetterRejected } from '@/lib/letters-notify'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

// FR-10: Return to Draft — `letter:approve` users only, requires a reason.
export const POST = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  if (!canApproveLetter(session.user.role)) {
    return apiForbidden('You are not permitted to reject letters')
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string }
  const reason = (body.reason || '').trim()
  if (!reason) return apiBadRequest('Rejection reason is required')

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  if (letter.status !== 'SUBMITTED') return apiBadRequest('Only SUBMITTED letters can be returned to draft')

  const updated = await prisma.letter.update({
    where: { id },
    data: { status: 'DRAFT' },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'LETTER_REJECTED',
    actorId: session.user.id,
    metadata: { reason, referenceNumber: letter.referenceNumber },
  })
  await notifyLetterRejected(session.user.id, updated, reason)
  return apiSuccess(updated)
})
