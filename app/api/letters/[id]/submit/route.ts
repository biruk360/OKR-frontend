import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { canCreateLetter } from '@/lib/permissions'
import { notifyLetterSubmitted } from '@/lib/letters-notify'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

// FR-9: Submit for Approval — only from DRAFT, by the preparer (or admin).
// Required fields must be present.
export const POST = withAuth<RouteIdParams>(async (_req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid letter id')

  const letter = await prisma.letter.findUnique({ where: { id } })
  if (!letter) return apiNotFound('Letter not found')
  if (!canCreateLetter(session.user.role)) return apiForbidden('Not permitted')
  if (letter.status !== 'DRAFT') return apiBadRequest('Only DRAFT letters can be submitted')
  if (letter.preparedById !== session.user.id && session.user.role !== 'ADMIN') {
    return apiForbidden('Only the preparer can submit this letter')
  }
  if (!letter.subject || !letter.customerName || !letter.bodyContent) {
    return apiBadRequest('Subject, customer, and body content are required before submission')
  }

  const updated = await prisma.letter.update({
    where: { id },
    data: { status: 'SUBMITTED' },
  })
  await recordActivity({
    entityType: 'LETTER',
    letterId: id,
    action: 'LETTER_SUBMITTED',
    actorId: session.user.id,
    metadata: { referenceNumber: letter.referenceNumber },
  })
  await notifyLetterSubmitted(session.user.id, updated)
  return apiSuccess(updated)
})
