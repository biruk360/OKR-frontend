import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { canApproveLetter } from '@/lib/permissions'
import { notifyLetterApproved } from '@/lib/letters-notify'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

// FR-10: Approve — only `letter:approve` users, only SUBMITTED → APPROVED.
export const POST = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  if (!canApproveLetter(session.user.role)) {
    return apiForbidden('You are not permitted to approve letters')
  }

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  if (letter.status !== 'SUBMITTED') return apiBadRequest('Only SUBMITTED letters can be approved')
  if (!letter.signatoryId) return apiBadRequest('A signatory must be assigned before approval')

  const updated = await prisma.letter.update({
    where: { id },
    data: { status: 'APPROVED' },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'LETTER_APPROVED',
    actorId: session.user.id,
    metadata: { referenceNumber: letter.referenceNumber },
  })
  await notifyLetterApproved(session.user.id, updated)
  return apiSuccess(updated)
})
