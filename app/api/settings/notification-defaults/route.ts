import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { withRole } from '@/lib/api/withAuth'
import { ALL_CATEGORIES, ensureOrgDefaults } from '@/lib/notifications'

/** GET — org-level notification defaults (Admin only). */
export const GET = withRole(['ADMIN', 'EXECUTIVE'], async () => {
  await ensureOrgDefaults()
  const rows = await prisma.orgNotificationDefault.findMany()
  const byCat = new Map(rows.map((r) => [r.category, r]))
  const data = ALL_CATEGORIES.map((c) => byCat.get(c) ?? { category: c, inApp: true, email: true, emailCadence: 'IMMEDIATE' })
  return apiSuccess(data)
})

/** PATCH — upsert org-level defaults. Admin only. */
export const PATCH = withRole(['ADMIN', 'EXECUTIVE'], async (req) => {
  const body = await req.json().catch(() => null)
  const rows: Array<{ category: string; inApp?: boolean; email?: boolean; emailCadence?: string }> =
    Array.isArray(body?.defaults) ? body.defaults : []
  if (rows.length === 0) return apiBadRequest('defaults[] required')
  for (const r of rows) {
    if (!ALL_CATEGORIES.includes(r.category as any)) return apiBadRequest(`Unknown category: ${r.category}`)
    const cadence = r.emailCadence && ['IMMEDIATE', 'DAILY', 'WEEKLY', 'DISABLED'].includes(r.emailCadence)
      ? r.emailCadence
      : 'IMMEDIATE'
    await prisma.orgNotificationDefault.upsert({
      where: { category: r.category },
      create: { category: r.category, inApp: r.inApp ?? true, email: r.email ?? true, emailCadence: cadence },
      update: { inApp: r.inApp ?? undefined, email: r.email ?? undefined, emailCadence: cadence },
    })
  }
  return apiSuccess({ updated: rows.length })
})
