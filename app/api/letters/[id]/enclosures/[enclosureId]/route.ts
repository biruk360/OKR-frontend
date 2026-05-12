import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { canAdminLetter, canEditLetter } from '@/lib/permissions'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

type Params = { id: string; enclosureId: string }

export const DELETE = withAuth<Params>(async (_req, { session, params }) => {
  const resolved = (await Promise.resolve(params)) as Params
  if (!resolved.id || !resolved.enclosureId) return apiBadRequest('Invalid ids')

  const enclosure = await prisma.letterEnclosure.findUnique({
    where: { id: resolved.enclosureId },
    include: { letter: true },
  })
  if (!enclosure || enclosure.letterId !== resolved.id) return apiNotFound('Enclosure not found')

  const isUploader = enclosure.uploadedById === session.user.id
  const editable = canEditLetter(session.user.role, session.user.id, enclosure.letter)
  if (!editable || (!isUploader && !canAdminLetter(session.user.role))) {
    return apiForbidden('You cannot delete this enclosure')
  }

  await prisma.letterEnclosure.delete({ where: { id: resolved.enclosureId } })
  await recordActivity({
    entityType: 'LETTER',
    letterId: enclosure.letterId,
    action: 'LETTER_ENCLOSURE_REMOVED',
    actorId: session.user.id,
    metadata: { fileName: enclosure.fileName },
  })
  return apiSuccess({ id: resolved.enclosureId })
})
