import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, apiValidationError, withAuth, withRoleOrFeature } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { assertCeoEligible } from '@/lib/orgValidation'
import { canSetCeo } from '@/lib/permissions'
import { diffOrgSettings, orgSettingsPatchSchema } from './schema'

/**
 * GET  /api/admin/org-settings  — fetch (or lazily create) the singleton row.
 * PATCH /api/admin/org-settings — update companyName, CEO, feature flags and the
 *   development plan yearly rule (devMinItems / devMinHours, DEV-3). Body is
 *   validated by `orgSettingsPatchSchema`; every change is activity-logged.
 *
 * Setting the CEO is restricted to ADMIN; other field updates allow EXEC too.
 */
export const GET = withRoleOrFeature(['ADMIN', 'EXECUTIVE'], 'page.admin.org-settings', async () => {
  const settings = await ensure()
  return apiSuccess(settings)
})

export const PATCH = withAuth(async (request: NextRequest, { session }) => {
  const role = session.user.role as any
  if (role !== 'ADMIN' && role !== 'EXECUTIVE') return apiForbidden('Insufficient permissions')

  const json = await request.json().catch(() => null)
  const parsed = orgSettingsPatchSchema.safeParse(json ?? {})
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid organization settings'
    return apiValidationError(message, parsed.error.flatten())
  }
  const patch = parsed.data
  const { companyCeoUserId } = patch

  if (companyCeoUserId !== undefined && !canSetCeo(role)) {
    return apiForbidden('Only ADMIN can change the CEO designation')
  }

  if (companyCeoUserId !== undefined && companyCeoUserId !== null) {
    const check = await assertCeoEligible(companyCeoUserId)
    if (!check.ok) return apiBadRequest(check.reason)
  }

  const before = await ensure()
  const updated = await prisma.organizationSettings.update({
    where: { id: 'singleton' },
    data: {
      ...(patch.companyName !== undefined && { companyName: patch.companyName }),
      ...(companyCeoUserId !== undefined && { companyCeoUserId }),
      ...(patch.allowMatrixReporting !== undefined && { allowMatrixReporting: patch.allowMatrixReporting }),
      ...(patch.allowMultipleDeptHeads !== undefined && { allowMultipleDeptHeads: patch.allowMultipleDeptHeads }),
      ...(patch.devMinItems !== undefined && { devMinItems: patch.devMinItems }),
      ...(patch.devMinHours !== undefined && { devMinHours: patch.devMinHours }),
    },
    include: { ceo: { select: { id: true, name: true, email: true, avatar: true, role: true } } },
  })

  const changes = diffOrgSettings(before, patch)
  if (Object.keys(changes).length > 0) {
    // No ORGANIZATION_SETTINGS entity type exists yet (lib/activity-log.ts is
    // owned elsewhere); org-wide settings rows are logged as settings changes.
    await recordActivity({
      entityType: 'PERFORMANCE_SETTINGS',
      action: 'SETTINGS_UPDATED',
      actorId: session.user.id,
      changes,
      metadata: { settingsModel: 'OrganizationSettings', settingsId: 'singleton' },
    })
  }

  return apiSuccess(updated)
})

async function ensure() {
  const existing = await prisma.organizationSettings.findUnique({
    where: { id: 'singleton' },
    include: { ceo: { select: { id: true, name: true, email: true, avatar: true, role: true } } },
  })
  if (existing) return existing
  return prisma.organizationSettings.create({
    data: { id: 'singleton' },
    include: { ceo: { select: { id: true, name: true, email: true, avatar: true, role: true } } },
  })
}
