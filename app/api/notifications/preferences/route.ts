import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { withAuth } from '@/lib/api/withAuth'
import {
  ALL_CATEGORIES, MANDATORY_CATEGORIES, isEmailCadence, resolveEffectivePref, seedCadenceFor,
  type EventCategory,
} from '@/lib/notifications'

/**
 * GET /api/notifications/preferences — current user's prefs, joined with org defaults.
 * Effective values come from the same resolver the dispatcher uses
 * (lib/notifications/cadence.ts), so what the page shows is what gets sent.
 */
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
    const eff = resolveEffectivePref({ category, userRow: u, orgRow: o })
    return {
      category,
      mandatory: eff.mandatory,
      inApp: eff.inApp,
      // Report the stored switch, not the DISABLED-derived one, so the checkbox
      // round-trips; the cadence select shows DISABLED separately.
      email: eff.mandatory ? true : (u?.email ?? o?.email ?? true),
      emailCadence: eff.emailCadence,
      orgDefault: o ? { inApp: o.inApp, email: o.email, emailCadence: o.emailCadence } : null,
      source: eff.source === 'mandatory' ? (u ? 'user' : o ? 'org' : 'hardcoded') : eff.source,
    }
  })
  return apiSuccess(data)
})

/** PATCH /api/notifications/preferences — upsert one or more (category, settings) rows. */
export const PATCH = withAuth(async (req, { session }) => {
  const userId = session.user.id
  const body = await req.json().catch(() => null)
  const rows: Array<{ category: EventCategory; inApp?: unknown; email?: unknown; emailCadence?: unknown }> =
    Array.isArray(body?.preferences) ? body.preferences : []
  if (rows.length === 0) return apiBadRequest('preferences[] required')

  // Validate everything before writing anything — a bad row must not leave a
  // half-applied save. An unknown cadence is rejected, never coerced (it used
  // to be silently rewritten to IMMEDIATE, which turned BATCHED off on save).
  for (const r of rows) {
    if (!ALL_CATEGORIES.includes(r.category)) return apiBadRequest(`Unknown category: ${r.category}`)
    if (r.emailCadence !== undefined && !isEmailCadence(r.emailCadence)) {
      return apiBadRequest(`Unknown emailCadence: ${String(r.emailCadence)}`)
    }
    if (r.inApp !== undefined && typeof r.inApp !== 'boolean') return apiBadRequest('inApp must be a boolean')
    if (r.email !== undefined && typeof r.email !== 'boolean') return apiBadRequest('email must be a boolean')
  }

  let updated = 0
  for (const r of rows) {
    if (MANDATORY_CATEGORIES.includes(r.category)) continue // silently ignore mandatory categories
    const cadence = isEmailCadence(r.emailCadence) ? r.emailCadence : undefined
    const inApp = typeof r.inApp === 'boolean' ? r.inApp : undefined
    const email = typeof r.email === 'boolean' ? r.email : undefined
    await prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category: r.category } },
      create: {
        userId, category: r.category,
        inApp: inApp ?? true,
        email: email ?? true,
        emailCadence: cadence ?? seedCadenceFor(r.category),
      },
      update: { inApp, email, emailCadence: cadence },
    })
    updated++
  }
  return apiSuccess({ updated })
})
