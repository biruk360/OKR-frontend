import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canResolveCycleIssue } from '@/lib/performance'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams } from '@/lib/resolve-route-params'

type IssueParams = { id: string; issueId: string } | Promise<{ id: string; issueId: string }>

export const PATCH = withAuth<IssueParams>(async (request: NextRequest, { session, params }) => {
  const { id, issueId } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canResolveCycleIssue(actor)) return apiForbidden('You do not have permission to resolve cycle issues')

  const body = await request.json().catch(() => ({})) as { status?: string }
  if (!body.status || !['RESOLVED', 'WAIVED', 'OPEN'].includes(body.status)) {
    return apiBadRequest('status must be RESOLVED, WAIVED, or OPEN')
  }

  const issue = await prisma.reviewCycleIssue.findUnique({
    where: { id: issueId },
    select: { cycleId: true, evaluationId: true, type: true },
  })
  if (!issue || issue.cycleId !== id) return apiNotFound('Cycle issue not found')

  const reopened = body.status === 'OPEN'
  const updated = await prisma.reviewCycleIssue.update({
    where: { id: issueId },
    data: {
      status: body.status,
      resolvedById: reopened ? null : session.user.id,
      resolvedAt: reopened ? null : new Date(),
    },
  })
  await recordActivity({
    entityType: 'REVIEW_CYCLE',
    evaluationId: issue.evaluationId,
    action: 'ISSUE_RESOLVED',
    actorId: session.user.id,
    metadata: { cycleId: id, issueId, issueType: issue.type, status: body.status },
  })
  return apiSuccess(updated)
})
