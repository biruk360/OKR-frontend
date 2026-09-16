import { NextRequest } from 'next/server'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { canReadAutomation } from '@/lib/automations/access'
import type { UserRole } from '@/types'

interface RouteParams { runId: string }

/**
 * Full run detail including the step transcript (FR-14). Owner and admin only —
 * recipients never see the transcript, the plan, or the cost.
 */
export const GET = withAuth<RouteParams>(async (_request: NextRequest, { session, params }) => {
  const run = await prisma.automationRun.findUnique({
    where: { id: params.runId },
    include: {
      automation: { select: { id: true, name: true, ownerId: true, deletedAt: true } },
      briefing: { select: { id: true, title: true, summary: true, status: true } },
    },
  })
  if (!run || !run.automation) return apiNotFound('Run not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canReadAutomation(principal, run.automation))) return apiForbidden('Insufficient permissions')

  return apiSuccess({
    id: run.id,
    automationId: run.automationId,
    automationName: run.automation.name,
    planVersion: run.planVersion,
    scheduledFor: run.scheduledFor,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    status: run.status,
    trigger: run.trigger,
    attempt: run.attempt,
    costUsd: run.costUsd,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    errorMessage: run.errorMessage,
    steps: run.stepsJson ?? [],
    findingCount: Array.isArray(run.findingsJson) ? run.findingsJson.length : 0,
    briefing: run.briefing,
  })
})
