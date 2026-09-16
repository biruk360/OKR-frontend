import { NextRequest } from 'next/server'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { canReadBriefing } from '@/lib/automations/access'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

/**
 * One Briefing, rendered. Returns the app HTML and the block list; the email
 * HTML is not exposed because it is a delivery artefact, not a view model.
 */
export const GET = withAuth<RouteParams>(async (_request: NextRequest, { session, params }) => {
  const briefing = await prisma.automationBriefing.findUnique({
    where: { id: params.id },
    include: {
      automation: { select: { id: true, name: true, ownerId: true, mode: true } },
      run: { select: { id: true, scheduledFor: true, trigger: true, status: true } },
    },
  })
  if (!briefing) return apiNotFound('Briefing not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canReadBriefing(principal, briefing))) return apiForbidden('Insufficient permissions')

  const isOwner = briefing.automation.ownerId === session.user.id
  const isAdmin = principal.role === 'ADMIN' || principal.role === 'EXECUTIVE'

  return apiSuccess({
    id: briefing.id,
    automationId: briefing.automationId,
    automationName: briefing.automation.name,
    mode: briefing.automation.mode,
    title: briefing.title,
    summary: briefing.summary,
    status: briefing.status,
    html: briefing.htmlApp,
    blocks: briefing.blocksJson,
    promoted: (briefing.promotedJson ?? []) as string[],
    newCount: briefing.newCount,
    changedCount: briefing.changedCount,
    unchangedCount: briefing.unchangedCount,
    resolvedCount: briefing.resolvedCount,
    publishedAt: briefing.publishedAt,
    approvedAt: briefing.approvedAt,
    createdAt: briefing.createdAt,
    // Run provenance is owner/admin detail — a recipient just reads the document.
    ...(isOwner || isAdmin ? { run: briefing.run, canApprove: briefing.status === 'PENDING_REVIEW' } : {}),
  })
})
