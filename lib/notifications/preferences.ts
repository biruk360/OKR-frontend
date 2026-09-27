/**
 * Resolve a user's effective notification preference for a category.
 *
 * Order (implemented once, in ./cadence.ts resolveEffectivePref):
 *   mandatory category (ACCOUNT) → always in-app + IMMEDIATE email
 *   → explicit NotificationPreference row
 *   → OrgNotificationDefault row
 *   → hard-coded default { inApp: true, email: true, BATCHED }.
 * A DISABLED cadence resolves to `email: false`.
 */

import { prisma } from '@/lib/prisma'
import { ALL_CATEGORIES, type EventCategory, type DefaultCadence } from './events'
import { resolveEffectivePref, seedCadenceFor } from './cadence'

export interface EffectivePref {
  inApp: boolean
  email: boolean
  emailCadence: DefaultCadence
  mandatory: boolean
}

function toEffective(p: ReturnType<typeof resolveEffectivePref>): EffectivePref {
  return { inApp: p.inApp, email: p.email, emailCadence: p.emailCadence, mandatory: p.mandatory }
}

export async function getUserPref(userId: string, category: EventCategory): Promise<EffectivePref> {
  const [userRow, orgRow] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId_category: { userId, category } } }),
    prisma.orgNotificationDefault.findUnique({ where: { category } }),
  ])
  return toEffective(resolveEffectivePref({ category, userRow, orgRow }))
}

/** Bulk-load prefs for a set of users (N+1 avoider for dispatcher fan-out). */
export async function getUserPrefsBulk(
  userIds: string[],
  category: EventCategory
): Promise<Map<string, EffectivePref>> {
  const [rows, orgRow] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, category },
    }),
    prisma.orgNotificationDefault.findUnique({ where: { category } }),
  ])
  const byUser = new Map(rows.map((r) => [r.userId, r]))
  const out = new Map<string, EffectivePref>()
  for (const id of userIds) {
    out.set(id, toEffective(resolveEffectivePref({ category, userRow: byUser.get(id) ?? null, orgRow })))
  }
  return out
}

/**
 * Seed org defaults for every category (idempotent — existing rows are never
 * touched). New rows get BATCHED email (IMMEDIATE for mandatory categories), so
 * seeding no longer overrides the BAT-2 default. Rows seeded as IMMEDIATE by the
 * old code are converted by scripts/notifications-set-batched-defaults.ts.
 */
export async function ensureOrgDefaults(): Promise<void> {
  await Promise.all(ALL_CATEGORIES.map((category) =>
    prisma.orgNotificationDefault.upsert({
      where: { category },
      create: { category, inApp: true, email: true, emailCadence: seedCadenceFor(category) },
      update: {},
    })
  ))
}
