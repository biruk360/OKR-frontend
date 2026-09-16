import { NextRequest } from 'next/server'
import { apiConflict, apiForbidden, apiLocked, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import { canManageAutomation } from '@/lib/automations/access'
import { enqueueManualRun, getAutomationSettings } from '@/lib/automations/service'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

/**
 * Queue a manual run (FR-05). Manual runs never consume or shift the schedule.
 * In AUTO mode a manual run still emails recipients — the UI confirms that first.
 */
export const POST = withAuth<RouteParams>(async (_request: NextRequest, { session, params }) => {
  const automation = await prisma.automation.findUnique({ where: { id: params.id } })
  if (!automation || automation.deletedAt) return apiNotFound('Automation not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canManageAutomation(principal, automation, 'submit'))) {
    return apiForbidden('Insufficient permissions')
  }

  const settings = await getAutomationSettings()
  if (settings.globalPaused) {
    return apiLocked('Automations are globally paused by an administrator')
  }

  const inFlight = await prisma.automationRun.count({
    where: { automationId: params.id, status: { in: ['QUEUED', 'LEASED', 'RUNNING'] } },
  })
  if (inFlight > 0) {
    return apiConflict('A run for this automation is already in progress')
  }

  const runId = await enqueueManualRun(params.id)
  await recordActivity({
    entityType: 'AUTOMATION',
    action: 'AUTOMATION_RUN_TRIGGERED',
    actorId: session.user.id,
    metadata: { automationId: params.id, runId, trigger: 'MANUAL', mode: automation.mode },
  })

  return apiSuccess({ runId, status: 'QUEUED' }, { status: 202 })
})
