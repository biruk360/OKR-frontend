import { prisma } from '@/lib/prisma'
import { isScrumDraft } from '@/features/scrum/services/drafts'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { apiBadRequest, apiNotFound, apiSuccess, withAuth } from '@/lib/api'

// Wins are deliberately visible org-wide (spec S6), so anyone signed in may
// celebrate — but only an update that actually carries a win.
export const POST = withAuth<{ id: string }>(async (_request, { session, params }) => {
  const update = await prisma.scrumUpdate.findUnique({ where: { id: params.id }, select: { id: true, userId: true, hasWin: true, status: true } })
  if (!update || isScrumDraft(update.status)) return apiNotFound('Scrum update not found')
  if (!update.hasWin) return apiBadRequest('Only wins can be celebrated')
  const existing = await prisma.scrumWinCelebration.findUnique({
    where: { updateId_userId: { updateId: params.id, userId: session.user.id } },
  })
  if (existing) return apiSuccess(existing, { message: 'Win already celebrated' })
  const celebration = await prisma.scrumWinCelebration.create({
    data: { updateId: params.id, userId: session.user.id },
  })
  await recordActivity({
    entityType: 'SCRUM_UPDATE',
    action: 'CELEBRATED',
    actorId: session.user.id,
    metadata: { updateId: params.id, celebrationId: celebration.id, subjectUserId: update.userId },
  })
  if (update.userId !== session.user.id) {
    await emit('SCRUM_WIN_CELEBRATED', {
      actorId: session.user.id,
      entityType: 'SCRUM_UPDATE',
      entityId: params.id,
      explicitRecipients: [update.userId],
      data: { deepLink: `/dashboard/scrum?update=${params.id}` },
    })
  }
  return apiSuccess(celebration, { message: 'Win celebrated' })
})
