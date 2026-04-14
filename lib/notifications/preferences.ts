/**
 * Resolve a user's effective notification preference for a category.
 * Order: explicit NotificationPreference row → org default → hard-coded default (true/IMMEDIATE).
 */

import { prisma } from '@/lib/prisma'
import { ALL_CATEGORIES, MANDATORY_CATEGORIES, type EventCategory, type DefaultCadence } from './events'

export interface EffectivePref {
  inApp: boolean
  email: boolean
  emailCadence: DefaultCadence
  mandatory: boolean
}

const HARDCODED_DEFAULT: EffectivePref = {
  inApp: true,
  email: true,
  emailCadence: 'IMMEDIATE',
  mandatory: false,
}

export async function getUserPref(userId: string, category: EventCategory): Promise<EffectivePref> {
  const mandatory = MANDATORY_CATEGORIES.includes(category)

  const [userRow, orgRow] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId_category: { userId, category } } }),
    prisma.orgNotificationDefault.findUnique({ where: { category } }),
  ])

  const base: EffectivePref = {
    inApp: orgRow?.inApp ?? HARDCODED_DEFAULT.inApp,
    email: orgRow?.email ?? HARDCODED_DEFAULT.email,
    emailCadence: ((orgRow?.emailCadence as DefaultCadence) ?? HARDCODED_DEFAULT.emailCadence),
    mandatory,
  }
  if (!userRow) return base

  return {
    inApp: mandatory ? true : userRow.inApp,
    email: mandatory ? true : userRow.email,
    emailCadence: mandatory ? 'IMMEDIATE' : (userRow.emailCadence as DefaultCadence),
    mandatory,
  }
}

/** Bulk-load prefs for a set of users (N+1 avoider for dispatcher fan-out). */
export async function getUserPrefsBulk(
  userIds: string[],
  category: EventCategory
): Promise<Map<string, EffectivePref>> {
  const mandatory = MANDATORY_CATEGORIES.includes(category)
  const [rows, orgRow] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, category },
    }),
    prisma.orgNotificationDefault.findUnique({ where: { category } }),
  ])
  const base: EffectivePref = {
    inApp: orgRow?.inApp ?? HARDCODED_DEFAULT.inApp,
    email: orgRow?.email ?? HARDCODED_DEFAULT.email,
    emailCadence: ((orgRow?.emailCadence as DefaultCadence) ?? HARDCODED_DEFAULT.emailCadence),
    mandatory,
  }
  const byUser = new Map(rows.map((r) => [r.userId, r]))
  const out = new Map<string, EffectivePref>()
  for (const id of userIds) {
    const row = byUser.get(id)
    if (!row) { out.set(id, base); continue }
    out.set(id, {
      inApp: mandatory ? true : row.inApp,
      email: mandatory ? true : row.email,
      emailCadence: mandatory ? 'IMMEDIATE' : (row.emailCadence as DefaultCadence),
      mandatory,
    })
  }
  return out
}

/** Seed org defaults for every category (idempotent). Call at app boot or from admin settings. */
export async function ensureOrgDefaults(): Promise<void> {
  await Promise.all(ALL_CATEGORIES.map((category) =>
    prisma.orgNotificationDefault.upsert({
      where: { category },
      create: { category, inApp: true, email: true, emailCadence: 'IMMEDIATE' },
      update: {},
    })
  ))
}
