import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { withAuth } from '@/lib/api/withAuth'
import { ALL_CATEGORIES, MANDATORY_CATEGORIES, type EventCategory } from '@/lib/notifications'

/** GET /api/notifications/preferences — current user's prefs, joined with org defaults. */
export const GET = withAuth(async (_req, { session }) => {
  const userId = session.user.id
  const [userRows, orgRows] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId } }),
    prisma.orgNotificationDefault.findMany(),
  ])
  const byCat = new Map(userRows.map((r) => [r.category, r]))
  const orgByCat = new Map(orgRows.map((r) => [r.category, r]))
  const data = ALL_CATEGORIES.map((category) => {
    const u = byCat.get(category)
    const o = orgByCat.get(category)
    const mandatory = MANDATORY_CATEGORIES.includes(category)
    return {
      category,
      mandatory,
      inApp: mandatory ? true : (u?.inApp ?? o?.inApp ?? true),
      email: mandatory ? true : (u?.email ?? o?.email ?? true),
      emailCadence: mandatory ? 'IMMEDIATE' : (u?.emailCadence ?? o?.emailCadence ?? 'IMMEDIATE'),
      orgDefault: o ? { inApp: o.inApp, email: o.email, emailCadence: o.emailCadence } : null,
      source: u ? 'user' : o ? 'org' : 'hardcoded',
    }
  })
  return apiSuccess(data)
})

/** PATCH /api/notifications/preferences — upsert one or more (category, settings) rows. */
export const PATCH = withAuth(async (req, { session }) => {
  const userId = session.user.id
  const body = await req.json().catch(() => null)
  const rows: Array<{ category: EventCategory; inApp?: boolean; email?: boolean; emailCadence?: string }> =
    Array.isArray(body?.preferences) ? body.preferences : []
  if (rows.length === 0) return apiBadRequest('preferences[] required')

  for (const r of rows) {
    if (!ALL_CATEGORIES.includes(r.category)) return apiBadRequest(`Unknown category: ${r.category}`)
    if (MANDATORY_CATEGORIES.includes(r.category)) continue // silently ignore mandatory categories
    const cadence = r.emailCadence && ['IMMEDIATE', 'DAILY', 'WEEKLY', 'DISABLED'].includes(r.emailCadence)
      ? r.emailCadence
      : 'IMMEDIATE'
    await prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category: r.category } },
      create: {
        userId, category: r.category,
        inApp: r.inApp ?? true,
        email: r.email ?? true,
        emailCadence: cadence,
      },
      update: {
        inApp: r.inApp ?? undefined,
        email: r.email ?? undefined,
        emailCadence: cadence,
      },
    })
  }
  return apiSuccess({ updated: rows.length })
})
