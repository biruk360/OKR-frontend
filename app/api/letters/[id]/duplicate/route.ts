import { prisma } from '@/lib/prisma'
import { checkLetterPermissionV2 } from '@/lib/letter-permissions'
import { allocateLetterReference } from '@/lib/letters'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

// POST /api/letters/[id]/duplicate
// Creates a DRAFT copy of the letter. The duplicate gets a fresh reference
// number, status DRAFT, today's date, and "(Copy)" appended to the subject.
export const POST = withAuth(async (_req, { session, params }) => {
  const { id } = await resolveParams(params as RouteIdParams)

  const canCreate = await checkLetterPermissionV2(session.user.id, 'letter.create')
  if (!canCreate) return apiForbidden('You do not have permission to create letters')

  const original = await prisma.letter.findUnique({
    where: { id },
    select: {
      subject: true,
      letterType: true,
      letterTypeId: true,
      customerName: true,
      odooPartnerId: true,
      recipientAddress: true,
      salutation: true,
      closing: true,
      senderDepartment: true,
      signatoryId: true,
      bodyContent: true,
      letterTypeDef: { select: { code: true } },
    },
  })
  if (!original) return apiNotFound('Letter not found')

  const typeCode = original.letterTypeDef?.code ?? original.letterType ?? 'LTR'
  const date = new Date()
  const referenceNumber = await allocateLetterReference(typeCode, date)

  const copy = await prisma.letter.create({
    data: {
      referenceNumber,
      subject: `${original.subject} (Copy)`,
      letterType: original.letterType,
      letterTypeId: original.letterTypeId,
      status: 'DRAFT',
      date,
      customerName: original.customerName,
      odooPartnerId: original.odooPartnerId,
      recipientAddress: original.recipientAddress,
      salutation: original.salutation,
      closing: original.closing,
      senderDepartment: original.senderDepartment,
      signatoryId: original.signatoryId,
      bodyContent: original.bodyContent,
      preparedById: session.user.id,
    },
    select: { id: true, referenceNumber: true, subject: true },
  })

  await recordActivity({
    entityType: 'LETTER',
    letterId: copy.id,
    action: 'LETTER_DUPLICATED',
    actorId: session.user.id,
    metadata: { sourceId: id, referenceNumber: copy.referenceNumber },
  })

  return apiSuccess(copy)
})
