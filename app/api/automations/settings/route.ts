import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { prisma } from '@/lib/prisma'
import { canAdministerAutomations } from '@/lib/automations/access'
import { getAutomationSettings } from '@/lib/automations/service'
import type { UserRole } from '@/types'

const patchSchema = z.object({
  globalPaused: z.boolean().optional(),
  domainAllowlist: z.array(z.string().trim().min(1).max(253)).max(200).optional(),
  orgDailyCostCapUsd: z.number().min(0).max(10000).optional(),
  maxConcurrentRuns: z.number().int().min(1).max(20).optional(),
  defaultTimezone: z.string().min(1).max(64).optional(),
  retentionDays: z.number().int().min(7).max(3650).optional(),
}).strict()

export const GET = withAuth(async (_request: NextRequest, { session }) => {
  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canAdministerAutomations(principal))) return apiForbidden('Insufficient permissions')
  return apiSuccess(await getAutomationSettings())
})

export const PATCH = withAuth(async (request: NextRequest, { session }) => {
  const principal = { userId: session.user.id, role: session.user.role as UserRole }
  if (!(await canAdministerAutomations(principal))) return apiForbidden('Insufficient permissions')

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid settings', parsed.error.flatten())

  const { domainAllowlist, ...rest } = parsed.data
  const settings = await prisma.automationSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...rest, ...(domainAllowlist ? { domainAllowlist } : {}) },
    update: { ...rest, ...(domainAllowlist ? { domainAllowlist } : {}) },
  })

  await recordActivity({
    entityType: 'AUTOMATION',
    action: 'SETTINGS_UPDATED',
    actorId: session.user.id,
    metadata: { fields: Object.keys(parsed.data) },
  })

  return apiSuccess(settings)
})
