import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiForbidden, withAuth, withRole, withRoleOrFeature } from '@/lib/api'
import { assertCeoEligible } from '@/lib/orgValidation'
import { canSetCeo } from '@/lib/permissions'

/**
 * GET  /api/admin/org-settings  — fetch (or lazily create) the singleton row.
 * PATCH /api/admin/org-settings — update companyName, CEO, feature flags.
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

  const body = await request.json().catch(() => ({}))
  const { companyName, companyCeoUserId, allowMatrixReporting, allowMultipleDeptHeads } = body ?? {}

  if (companyCeoUserId !== undefined && !canSetCeo(role)) {
    return apiForbidden('Only ADMIN can change the CEO designation')
  }

  if (companyCeoUserId !== undefined && companyCeoUserId !== null) {
    const check = await assertCeoEligible(companyCeoUserId)
    if (!check.ok) return apiBadRequest(check.reason)
  }

  await ensure()
  const updated = await prisma.organizationSettings.update({
    where: { id: 'singleton' },
    data: {
      ...(companyName !== undefined && { companyName }),
      ...(companyCeoUserId !== undefined && { companyCeoUserId }),
      ...(allowMatrixReporting !== undefined && { allowMatrixReporting }),
      ...(allowMultipleDeptHeads !== undefined && { allowMultipleDeptHeads }),
    },
    include: { ceo: { select: { id: true, name: true, email: true, avatar: true, role: true } } },
  })
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
