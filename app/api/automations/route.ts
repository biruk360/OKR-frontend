import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import {
  canApproveToolGrants,
  canAuthorAutomations,
  filterVisibleRecipients,
  isAdminRole,
  toolGrantDenialMessage,
  toolGrantsRequiringApproval,
} from '@/lib/automations/access'
import { createAutomation, toAutomationSummary } from '@/lib/automations/crud'
import { PlanValidationError } from '@/lib/automations/plan'
import { DELIVERY_CHANNELS, TOOL_IDS } from '@/types/automations'
import type { UserRole } from '@/types'

const recipientSchema = z.object({
  userId: z.string().min(1),
  channels: z.array(z.enum(DELIVERY_CHANNELS)).min(1),
})

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  instructionText: z.string().trim().min(1).max(4000),
  plan: z.unknown(),
  toolGrants: z.array(z.object({
    tool: z.enum(TOOL_IDS),
    params: z.record(z.string(), z.unknown()).optional(),
  })).default([]),
  recipients: z.array(recipientSchema).max(50).default([]),
  maxCostUsdPerRun: z.number().min(0).max(50).optional(),
  maxCostUsdMonth: z.number().min(0).max(1000).optional(),
}).strict()

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const role = session.user.role as UserRole
  const url = new URL(request.url)
  const mine = url.searchParams.get('scope') !== 'all'

  const automations = await prisma.automation.findMany({
    where: {
      deletedAt: null,
      ...(mine || !isAdminRole(role) ? { ownerId: session.user.id } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  return apiSuccess(automations.map(toAutomationSummary))
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const role = session.user.role as UserRole
  const principal = { userId: session.user.id, role }

  if (!(await canAuthorAutomations(principal))) {
    return apiForbidden('You do not have permission to create automations')
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid automation', parsed.error.flatten())

  // Tool grants are the security boundary, not a field the requester fills in
  // (spec §7, §13). A non-admin may only self-grant the Tier-0 tools; anything
  // that reaches a shared service account or the internet needs an ADMIN.
  const deniedGrants = toolGrantsRequiringApproval(parsed.data.toolGrants)
  if (deniedGrants.length > 0 && !(await canApproveToolGrants(principal))) {
    return apiForbidden(toolGrantDenialMessage(deniedGrants))
  }

  // Recipients narrow to users the author can actually see (spec §3.3).
  const recipients = await filterVisibleRecipients(principal, parsed.data.recipients)

  try {
    const automation = await createAutomation({
      ...parsed.data,
      recipients,
      ownerId: session.user.id,
      createdById: session.user.id,
    })

    await recordActivity({
      entityType: 'AUTOMATION',
      action: 'CREATED',
      actorId: session.user.id,
      metadata: { automationId: automation.id, name: automation.name, mode: automation.mode },
    })

    return apiSuccess(toAutomationSummary(automation), { status: 201 })
  } catch (error) {
    if (error instanceof PlanValidationError) {
      return apiValidationError(error.message, { issues: error.issues })
    }
    throw error
  }
})
