import { NextRequest } from 'next/server'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import { canManageAutomation } from '@/lib/automations/access'
import { deliverBriefing, seedRecipientRows } from '@/lib/automations/delivery'
import type { AutomationRecipient } from '@/types/automations'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

/**
 * Release a REVIEW-mode Briefing to its recipients (FR-10). This is the moment
 * the document leaves the system, so it is an explicit, audited action.
 */
export const POST = withAuth<RouteParams>(async (_request: NextRequest, { session, params }) => {
  const briefing = await prisma.automationBriefing.findUnique({
    where: { id: params.id },
    include: { automation: true },
  })
  if (!briefing) return apiNotFound('Briefing not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canManageAutomation(principal, briefing.automation, 'submit'))) {
    return apiForbidden('Insufficient permissions')
  }
  if (briefing.status !== 'PENDING_REVIEW') {
    return apiBadRequest(`Briefing is ${briefing.status.toLowerCase()} — only a pending-review briefing can be approved`)
  }

  const recipients = (briefing.automation.recipientsJson ?? []) as unknown as AutomationRecipient[]
  await seedRecipientRows(briefing.id, recipients)

  const outcome = await deliverBriefing(
    {
      id: briefing.id,
      automationId: briefing.automationId,
      automationName: briefing.automation.name,
      title: briefing.title,
      summary: briefing.summary,
      htmlEmail: briefing.htmlEmail,
      textPlain: briefing.textPlain,
      newCount: briefing.newCount,
      changedCount: briefing.changedCount,
    },
    recipients
  )

  const updated = await prisma.automationBriefing.update({
    where: { id: briefing.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
    select: { id: true, status: true, publishedAt: true },
  })

  await recordActivity({
    entityType: 'AUTOMATION_BRIEFING',
    action: 'AUTOMATION_BRIEFING_APPROVED',
    actorId: session.user.id,
    metadata: { briefingId: briefing.id, automationId: briefing.automationId, ...outcome },
  })

  return apiSuccess({ ...updated, delivery: outcome })
})
