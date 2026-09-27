import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { withRoleOrFeature } from '@/lib/api/withAuth'
import { ALL_CATEGORIES, MANDATORY_CATEGORIES, ensureOrgDefaults, isEmailCadence, seedCadenceFor, type EventCategory } from '@/lib/notifications'

/** GET — org-level notification defaults (Admin only). */
export const GET = withRoleOrFeature(['ADMIN', 'EXECUTIVE'], 'page.settings.notification-defaults', async () => {
  await ensureOrgDefaults()
  const rows = await prisma.orgNotificationDefault.findMany()
  const byCat = new Map(rows.map((r) => [r.category, r]))
  const data = ALL_CATEGORIES.map((c) => {
    const row = byCat.get(c)
    const mandatory = MANDATORY_CATEGORIES.includes(c)
    return {
      category: c,
      mandatory,
      inApp: row?.inApp ?? true,
      email: row?.email ?? true,
      emailCadence: row && isEmailCadence(row.emailCadence) ? row.emailCadence : seedCadenceFor(c),
    }
  })
  return apiSuccess(data)
})

/** PATCH — upsert org-level defaults. Admin only. */
export const PATCH = withRoleOrFeature(['ADMIN', 'EXECUTIVE'], 'page.settings.notification-defaults', async (req) => {
  const body = await req.json().catch(() => null)
  const rows: Array<{ category: string; inApp?: unknown; email?: unknown; emailCadence?: unknown }> =
    Array.isArray(body?.defaults) ? body.defaults : []
  if (rows.length === 0) return apiBadRequest('defaults[] required')

  // Validate the whole batch first; unknown cadences are rejected, not coerced
  // to IMMEDIATE (which silently turned BATCHED off on every save).
  for (const r of rows) {
    if (!ALL_CATEGORIES.includes(r.category as EventCategory)) return apiBadRequest(`Unknown category: ${r.category}`)
    if (r.emailCadence !== undefined && !isEmailCadence(r.emailCadence)) {
      return apiBadRequest(`Unknown emailCadence: ${String(r.emailCadence)}`)
    }
    if (r.inApp !== undefined && typeof r.inApp !== 'boolean') return apiBadRequest('inApp must be a boolean')
    if (r.email !== undefined && typeof r.email !== 'boolean') return apiBadRequest('email must be a boolean')
  }

  for (const r of rows) {
    const category = r.category as EventCategory
    // Mandatory categories are always delivered immediately; the resolver
    // ignores their rows, so don't store a misleading value either.
    const mandatory = MANDATORY_CATEGORIES.includes(category)
    const cadence = mandatory ? 'IMMEDIATE' : (isEmailCadence(r.emailCadence) ? r.emailCadence : undefined)
    const inApp = mandatory ? true : (typeof r.inApp === 'boolean' ? r.inApp : undefined)
    const email = mandatory ? true : (typeof r.email === 'boolean' ? r.email : undefined)
    await prisma.orgNotificationDefault.upsert({
      where: { category },
      create: { category, inApp: inApp ?? true, email: email ?? true, emailCadence: cadence ?? seedCadenceFor(category) },
      update: { inApp, email, emailCadence: cadence },
    })
  }
  return apiSuccess({ updated: rows.length })
})
