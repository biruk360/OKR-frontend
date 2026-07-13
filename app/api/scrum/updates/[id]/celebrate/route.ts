import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import { apiNotFound, apiSuccess, withAuth } from '@/lib/api'

export const POST = withAuth<{ id: string }>(async (_request, { session, params }) => {
  const update = await prisma.scrumUpdate.findUnique({ where: { id: params.id } })
  if (!update) return apiNotFound('Scrum update not found')
  const celebration = await prisma.scrumWinCelebration.upsert({
    where: { updateId_userId: { updateId: params.id, userId: session.user.id } },
    create: { updateId: params.id, userId: session.user.id },
    update: {},
  })
  await emit('SCRUM_WIN_CELEBRATED', {
    actorId: session.user.id,
    entityType: 'SCRUM_UPDATE',
    entityId: params.id,
    explicitRecipients: [update.userId],
    data: { deepLink: `/dashboard/scrum?update=${params.id}` },
  })
  return apiSuccess(celebration, { message: 'Win celebrated' })
})
