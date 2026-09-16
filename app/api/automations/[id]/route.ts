import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import { canManageAutomation, canReadAutomation } from '@/lib/automations/access'
import { monthToDateSpend, softDeleteAutomation, toAutomationSummary, updateAutomation } from '@/lib/automations/crud'
import { PlanValidationError } from '@/lib/automations/plan'
import { DELIVERY_CHANNELS, TOOL_IDS } from '@/types/automations'
import type { UserRole } from '@/types'

interface RouteParams { id: string }

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  instructionText: z.string().trim().min(1).max(4000).optional(),
  plan: z.unknown().optional(),
  toolGrants: z.array(z.object({
    tool: z.enum(TOOL_IDS),
    params: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
  recipients: z.array(z.object({
    userId: z.string().min(1),
    channels: z.array(z.enum(DELIVERY_CHANNELS)).min(1),
  })).max(50).optional(),
  maxCostUsdPerRun: z.number().min(0).max(50).optional(),
  maxCostUsdMonth: z.number().min(0).max(1000).optional(),
  status: z.enum(['ENABLED', 'PAUSED']).optional(),
}).strict()

export const GET = withAuth<RouteParams>(async (_request: NextRequest, { session, params }) => {
  const automation = await prisma.automation.findUnique({ where: { id: params.id } })
  if (!automation || automation.deletedAt) return apiNotFound('Automation not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canReadAutomation(principal, automation))) return apiForbidden('Insufficient permissions')

  return apiSuccess({
    ...toAutomationSummary(automation),
    monthToDateSpendUsd: await monthToDateSpend(automation.id),
    instructionText: automation.instructionText,
    plan: automation.planJson,
    toolGrants: automation.toolGrants,
    recipients: automation.recipientsJson,
    maxCostUsdPerRun: automation.maxCostUsdPerRun,
    maxCostUsdMonth: automation.maxCostUsdMonth,
    timeoutSeconds: automation.timeoutSeconds,
    compiledAt: automation.compiledAt,
    compiledModelId: automation.compiledModelId,
  })
})

export const PATCH = withAuth<RouteParams>(async (request: NextRequest, { session, params }) => {
  const automation = await prisma.automation.findUnique({ where: { id: params.id } })
  if (!automation || automation.deletedAt) return apiNotFound('Automation not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canManageAutomation(principal, automation))) return apiForbidden('Insufficient permissions')

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid automation update', parsed.error.flatten())

  try {
    const updated = await updateAutomation(params.id, parsed.data)
    await recordActivity({
      entityType: 'AUTOMATION',
      action: 'UPDATED',
      actorId: session.user.id,
      metadata: {
        automationId: updated.id,
        planVersion: updated.planVersion,
        fields: Object.keys(parsed.data),
      },
    })
    return apiSuccess(toAutomationSummary(updated))
  } catch (error) {
    if (error instanceof PlanValidationError) {
      return apiValidationError(error.message, { issues: error.issues })
    }
    throw error
  }
})

export const DELETE = withAuth<RouteParams>(async (_request: NextRequest, { session, params }) => {
  const automation = await prisma.automation.findUnique({ where: { id: params.id } })
  if (!automation || automation.deletedAt) return apiNotFound('Automation not found')

  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canManageAutomation(principal, automation, 'delete'))) {
    return apiForbidden('Insufficient permissions')
  }

  await softDeleteAutomation(params.id)
  await recordActivity({
    entityType: 'AUTOMATION',
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { automationId: params.id, name: automation.name },
  })
  return apiSuccess({ id: params.id, deleted: true })
})
