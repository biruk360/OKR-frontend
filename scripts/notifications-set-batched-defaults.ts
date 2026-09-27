/**
 * One-off: move org notification defaults that are still on the OLD seeded
 * value onto BATCHED (BAT-2).
 *
 * Why: ensureOrgDefaults() used to seed every OrgNotificationDefault row as
 * { inApp: true, email: true, emailCadence: 'IMMEDIATE' }. Org rows beat the
 * hard-coded BATCHED default, so once the admin defaults page had been opened
 * the BATCHED default never applied to anyone. The seed is fixed; this converts
 * the rows it already wrote.
 *
 * Converts ONLY rows that:
 *   - are for a non-mandatory category (ACCOUNT stays IMMEDIATE), and
 *   - exactly equal the old seed: inApp=true, email=true, emailCadence='IMMEDIATE'.
 * Anything else (DAILY, WEEKLY, email off, in-app off, …) was a deliberate
 * admin choice and is left alone. A row that equals the seed but was edited
 * after creation (updatedAt > createdAt + 5s) is reported as "possibly chosen";
 * pass --only-untouched to skip those too.
 *
 * Per-user NotificationPreference rows are NEVER changed (spec A2: users who
 * chose IMMEDIATE keep it); the script only counts them for information.
 *
 * Dry-run by default: prints what it would do and writes nothing.
 *
 * Usage:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/notifications-set-batched-defaults.ts
 *   npx tsx --env-file=.env --env-file=.env.local scripts/notifications-set-batched-defaults.ts --apply
 *   npx tsx --env-file=.env --env-file=.env.local scripts/notifications-set-batched-defaults.ts --apply --only-untouched
 *
 * Spec: docs/notification_email_batching_REQUIREMENTS.md BAT-2, A2.
 */

import { prisma } from '../lib/prisma'
import { ALL_CATEGORIES, MANDATORY_CATEGORIES, type EventCategory } from '../lib/notifications/events'
import { DEFAULT_EMAIL_CADENCE, LEGACY_SEEDED_ORG_DEFAULT } from '../lib/notifications/cadence'

const APPLY = process.argv.includes('--apply')
const ONLY_UNTOUCHED = process.argv.includes('--only-untouched')
const EDIT_GRACE_MS = 5_000

async function main() {
  console.log(`[notifications-set-batched-defaults] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}${ONLY_UNTOUCHED ? ' only-untouched' : ''}`)

  const rows = await prisma.orgNotificationDefault.findMany({ orderBy: { category: 'asc' } })
  const toConvert: string[] = []

  for (const r of rows) {
    const known = ALL_CATEGORIES.includes(r.category as EventCategory)
    const mandatory = MANDATORY_CATEGORIES.includes(r.category as EventCategory)
    const isLegacySeed =
      r.inApp === LEGACY_SEEDED_ORG_DEFAULT.inApp &&
      r.email === LEGACY_SEEDED_ORG_DEFAULT.email &&
      r.emailCadence === LEGACY_SEEDED_ORG_DEFAULT.emailCadence
    const edited = r.updatedAt.getTime() - r.createdAt.getTime() > EDIT_GRACE_MS
    const state = `inApp=${r.inApp} email=${r.email} cadence=${r.emailCadence}`

    let verdict: string
    if (!known) verdict = 'SKIP (unknown category)'
    else if (mandatory) verdict = 'SKIP (mandatory — stays IMMEDIATE)'
    else if (!isLegacySeed) verdict = 'SKIP (not the old seed — admin choice)'
    else if (edited && ONLY_UNTOUCHED) verdict = 'SKIP (edited after seeding; --only-untouched)'
    else {
      verdict = `CONVERT → ${DEFAULT_EMAIL_CADENCE}${edited ? '  [possibly chosen: edited after seeding]' : ''}`
      toConvert.push(r.category)
    }
    console.log(`  ${r.category.padEnd(12)} ${state.padEnd(44)} ${verdict}`)
  }

  const missing = ALL_CATEGORIES.filter((c) => !rows.some((r) => r.category === c))
  if (missing.length > 0) {
    console.log(`  (no org row yet for: ${missing.join(', ')} — they resolve to the BATCHED hard-coded default and will be seeded as BATCHED)`)
  }

  const userImmediate = await prisma.notificationPreference.count({ where: { emailCadence: 'IMMEDIATE' } })
  console.log(`  info: ${userImmediate} per-user preference row(s) are IMMEDIATE — left untouched by design.`)

  if (toConvert.length === 0) {
    console.log('Nothing to convert.')
    return
  }
  if (!APPLY) {
    console.log(`Would convert ${toConvert.length} org row(s). Re-run with --apply to write.`)
    return
  }

  const res = await prisma.orgNotificationDefault.updateMany({
    where: {
      category: { in: toConvert },
      // Re-assert the guard in the write itself, so a row changed between the
      // read above and this update is not clobbered.
      inApp: LEGACY_SEEDED_ORG_DEFAULT.inApp,
      email: LEGACY_SEEDED_ORG_DEFAULT.email,
      emailCadence: LEGACY_SEEDED_ORG_DEFAULT.emailCadence,
    },
    data: { emailCadence: DEFAULT_EMAIL_CADENCE },
  })
  console.log(`Converted ${res.count} org row(s) to ${DEFAULT_EMAIL_CADENCE}.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
