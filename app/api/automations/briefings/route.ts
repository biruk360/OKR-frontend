import { NextRequest } from 'next/server'
import { apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { isAdminRole } from '@/lib/automations/access'
import type { UserRole } from '@/types'

/**
 * Briefings the caller may read (FR-09): their own automations' output, plus
 * any PUBLISHED briefing they are a recipient of. Admins see everything.
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const role = session.user.role as UserRole
  const url = new URL(request.url)
  const automationId = url.searchParams.get('automationId')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)

  // Recipient lists live in a JSON column, so the "briefings sent to me" half of
  // the query resolves through the delivery rows instead of a JSON predicate.
  const deliveredToMe = await prisma.automationBriefingRecipient.findMany({
    where: { userId: session.user.id },
    select: { briefingId: true },
    take: 500,
  })

  const briefings = await prisma.automationBriefing.findMany({
    where: {
      ...(automationId ? { automationId } : {}),
      ...(isAdminRole(role)
        ? {}
        : {
            OR: [
              { automation: { ownerId: session.user.id } },
              { id: { in: deliveredToMe.map((d) => d.briefingId) }, status: 'PUBLISHED' },
            ],
          }),
      automation: { deletedAt: null },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, automationId: true, title: true, summary: true, status: true,
      newCount: true, changedCount: true, unchangedCount: true, resolvedCount: true,
      publishedAt: true, createdAt: true,
      automation: { select: { name: true, mode: true } },
    },
  })

  return apiSuccess(briefings.map((b) => ({
    id: b.id,
    automationId: b.automationId,
    automationName: b.automation.name,
    mode: b.automation.mode,
    title: b.title,
    summary: b.summary,
    status: b.status,
    newCount: b.newCount,
    changedCount: b.changedCount,
    unchangedCount: b.unchangedCount,
    resolvedCount: b.resolvedCount,
    publishedAt: b.publishedAt,
    createdAt: b.createdAt,
  })))
})
