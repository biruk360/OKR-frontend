import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import { canManageAutomation } from '@/lib/automations/access'
import { changeMode, toAutomationSummary } from '@/lib/automations/crud'
import { DISTRIBUTION_MODES } from '@/types/automations'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

const bodySchema = z.object({ mode: z.enum(DISTRIBUTION_MODES) }).strict()

/**
 * Change the distribution mode (FR-05 / spec §4.1). Promotion to AUTO is the
 * moment recipients start receiving email, so it is gated on at least one
 * successful run and confirmed in the UI with the recipient list named.
 */
export const POST = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  const automation = await prisma.automation.findUnique({ where: { id: params.id } })
  if (!automation || automation.deletedAt) return apiNotFound('Automation not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canManageAutomation(principal, automation, 'submit'))) {
    return apiForbidden('Insufficient permissions')
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid mode', parsed.error.flatten())

  try {
    const updated = await changeMode(params.id, parsed.data.mode)
    await recordActivity({
      entityType: 'AUTOMATION',
      action: 'AUTOMATION_MODE_CHANGED',
      actorId: session.user.id,
      changes: { mode: { from: automation.mode, to: parsed.data.mode } },
      metadata: { automationId: params.id },
    })
    return apiSuccess(toAutomationSummary(updated))
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : 'Mode change rejected')
  }
})
