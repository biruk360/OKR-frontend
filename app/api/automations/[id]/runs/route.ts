import { NextRequest } from 'next/server'
import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { canReadAutomation } from '@/lib/automations/access'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

/** Run timeline (FR-14). Transcripts are fetched per-run, not in the list. */
export const GET = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  const automation = await prisma.automation.findUnique({ where: { id: params.id } })
  if (!automation || automation.deletedAt) return apiNotFound('Automation not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canReadAutomation(principal, automation))) return apiForbidden('Insufficient permissions')

  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 50, 200)
  const runs = await prisma.automationRun.findMany({
    where: { automationId: params.id },
    orderBy: { scheduledFor: 'desc' },
    take: limit,
    select: {
      id: true, scheduledFor: true, startedAt: true, finishedAt: true, status: true,
      trigger: true, attempt: true, costUsd: true, errorMessage: true, planVersion: true,
      briefing: { select: { id: true, title: true, newCount: true, changedCount: true, unchangedCount: true, status: true } },
    },
  })

  return apiSuccess(runs.map((run) => ({
    ...run,
    durationMs: run.startedAt && run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
  })))
})
