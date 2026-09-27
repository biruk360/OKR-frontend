/**
 * Email cadence — the single source of truth for which cadences exist, what the
 * settings UIs call them, and how a user's effective preference is resolved.
 *
 * Client-safe: no Prisma, no server imports. The settings pages import this
 * module directly (NOT the `@/lib/notifications` barrel, which pulls in the
 * dispatcher and Prisma).
 *
 * Resolution order (see resolveEffectivePref):
 *   1. MANDATORY_CATEGORIES (ACCOUNT) → always in-app + IMMEDIATE email; rows ignored.
 *   2. The user's NotificationPreference row, if any.
 *   3. The OrgNotificationDefault row for the category, if any.
 *   4. The hard-coded default: in-app on, email on, BATCHED (BAT-2).
 * A cadence of DISABLED always resolves to `email: false`, so nothing is ever
 * queued under a cadence no drain will pick up.
 */

import { MANDATORY_CATEGORIES, type EventCategory } from './events'

/** Every cadence a preference row may hold. `EmailDigestQueue.cadence` uses the same strings. */
export const EMAIL_CADENCES = ['IMMEDIATE', 'BATCHED', 'DAILY', 'WEEKLY', 'MONTHLY', 'DISABLED'] as const
export type EmailCadence = (typeof EMAIL_CADENCES)[number]

/** Cadences offered in the settings UIs, in display order. */
export const SELECTABLE_CADENCES: readonly EmailCadence[] = ['BATCHED', 'IMMEDIATE', 'DAILY', 'WEEKLY', 'MONTHLY', 'DISABLED']

export const CADENCE_LABEL: Record<EmailCadence, string> = {
  BATCHED: 'Every 10 minutes (batched)',
  IMMEDIATE: 'Immediately (one email per event)',
  DAILY: 'Daily digest',
  WEEKLY: 'Weekly digest',
  MONTHLY: 'Monthly digest',
  DISABLED: 'No email',
}

/** Default email cadence for every non-mandatory category (BAT-2). */
export const DEFAULT_EMAIL_CADENCE: EmailCadence = 'BATCHED'

/**
 * What ensureOrgDefaults() used to seed for every category before BAT-2 was
 * wired end-to-end. scripts/notifications-set-batched-defaults.ts converts org
 * rows still sitting on exactly this value.
 */
export const LEGACY_SEEDED_ORG_DEFAULT = { inApp: true, email: true, emailCadence: 'IMMEDIATE' } as const

export function isEmailCadence(v: unknown): v is EmailCadence {
  return typeof v === 'string' && (EMAIL_CADENCES as readonly string[]).includes(v)
}

export function isMandatoryCategory(category: EventCategory): boolean {
  return MANDATORY_CATEGORIES.includes(category)
}

/** Cadence a fresh org-default row is seeded with: IMMEDIATE for mandatory categories, else BATCHED. */
export function seedCadenceFor(category: EventCategory): EmailCadence {
  return isMandatoryCategory(category) ? 'IMMEDIATE' : DEFAULT_EMAIL_CADENCE
}

export interface PrefRowLike {
  inApp: boolean
  email: boolean
  emailCadence: string
}

export interface ResolvedPref {
  inApp: boolean
  email: boolean
  emailCadence: EmailCadence
  mandatory: boolean
  source: 'user' | 'org' | 'hardcoded' | 'mandatory'
}

/**
 * Pure resolver shared by getUserPref / getUserPrefsBulk / the preferences API.
 * An unrecognised stored cadence falls back to the next layer's cadence rather
 * than to IMMEDIATE, so a bad row can never re-enable per-event email.
 */
export function resolveEffectivePref(input: {
  category: EventCategory
  userRow?: PrefRowLike | null
  orgRow?: PrefRowLike | null
}): ResolvedPref {
  const { category, userRow, orgRow } = input
  if (isMandatoryCategory(category)) {
    return { inApp: true, email: true, emailCadence: 'IMMEDIATE', mandatory: true, source: 'mandatory' }
  }

  const orgCadence: EmailCadence = isEmailCadence(orgRow?.emailCadence) ? orgRow!.emailCadence as EmailCadence : DEFAULT_EMAIL_CADENCE
  const layer = userRow ?? orgRow ?? null
  const source: ResolvedPref['source'] = userRow ? 'user' : orgRow ? 'org' : 'hardcoded'
  const inApp = layer ? layer.inApp : true
  const emailCadence: EmailCadence = userRow
    ? (isEmailCadence(userRow.emailCadence) ? userRow.emailCadence as EmailCadence : orgCadence)
    : orgCadence
  const email = (layer ? layer.email : true) && emailCadence !== 'DISABLED'
  return { inApp, email, emailCadence, mandatory: false, source }
}
