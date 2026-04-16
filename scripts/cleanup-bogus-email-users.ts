/**
 * Deactivate users whose email addresses are not real mailboxes so the
 * notification/digest cron jobs stop sending bounce-prone emails to them.
 *
 * Targets two known sources of fake-but-active users:
 *   1. Seed test data: `*@company.com` rows created by prisma/seed-test-data.ts.
 *   2. Import placeholder: `unassigned@360ground.com` created by scripts/import-360ground-okrs.js
 *      for CSV rows whose owner was blank or "TBD".
 *
 * We deactivate rather than delete because these users own real entities
 * (Objectives, KeyResults, Todos) and those relations are restrict-on-delete
 * in the schema. Deactivating (`isActive = false`) is enough — every cron
 * and recipient resolver filters on `isActive: true` before sending mail.
 *
 * Side-effects in commit mode:
 *   - Sets `isActive = false` on each matched user.
 *   - Marks any pending EmailDigestQueue rows for those users as sent (sentAt = now)
 *     so the next drain doesn't dispatch a final bounce.
 *   - Cancels any PENDING OutboundEmail rows addressed to those emails
 *     (status -> 'FAILED', error -> 'cancelled: bogus recipient').
 *
 * Usage:
 *   # Preview (no writes):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/cleanup-bogus-email-users.ts
 *
 *   # Apply:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/cleanup-bogus-email-users.ts --commit
 */

import { prisma } from '../lib/prisma'

const EXACT_EMAILS = ['unassigned@360ground.com']
const EMAIL_SUFFIXES = ['@company.com']

interface Args {
  commit: boolean
}

function parseArgs(): Args {
  const args: Args = { commit: false }
  for (const a of process.argv.slice(2)) {
    if (a === '--commit') args.commit = true
  }
  return args
}

async function main() {
  const { commit } = parseArgs()
  console.log(`[cleanup] mode: ${commit ? 'COMMIT' : 'DRY-RUN'}`)

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: EXACT_EMAILS } },
        ...EMAIL_SUFFIXES.map((s) => ({ email: { endsWith: s } })),
      ],
    },
    select: { id: true, email: true, name: true, isActive: true },
    orderBy: { email: 'asc' },
  })

  if (users.length === 0) {
    console.log('[cleanup] no matching users found — nothing to do')
    return
  }

  console.log(`[cleanup] matched ${users.length} user(s):`)
  const userIds = users.map((u) => u.id)

  const [ownedObjectives, ownedKRs, assignedTodos, createdTodos, pendingDigest, pendingOutbound] = await Promise.all([
    prisma.objective.groupBy({ by: ['ownerId'], where: { ownerId: { in: userIds } }, _count: { _all: true } }),
    prisma.keyResult.groupBy({ by: ['ownerId'], where: { ownerId: { in: userIds } }, _count: { _all: true } }),
    prisma.todo.groupBy({ by: ['assigneeId'], where: { assigneeId: { in: userIds } }, _count: { _all: true } }),
    prisma.todo.groupBy({ by: ['creatorId'], where: { creatorId: { in: userIds } }, _count: { _all: true } }),
    prisma.emailDigestQueue.count({ where: { userId: { in: userIds }, sentAt: null } }),
    prisma.outboundEmail.count({
      where: {
        status: 'PENDING',
        toEmail: {
          in: users.map((u) => u.email),
        },
      },
    }),
  ])

  const obj = Object.fromEntries(ownedObjectives.map((r) => [r.ownerId, r._count._all]))
  const kr = Object.fromEntries(ownedKRs.map((r) => [r.ownerId, r._count._all]))
  const ta = Object.fromEntries(assignedTodos.map((r) => [r.assigneeId, r._count._all]))
  const tc = Object.fromEntries(createdTodos.map((r) => [r.creatorId, r._count._all]))

  for (const u of users) {
    console.log(
      `  - ${u.email.padEnd(32)} active=${String(u.isActive).padEnd(5)} ` +
      `objectives=${obj[u.id] ?? 0} krs=${kr[u.id] ?? 0} ` +
      `todos(assigned/created)=${ta[u.id] ?? 0}/${tc[u.id] ?? 0}`
    )
  }
  console.log(`[cleanup] pending EmailDigestQueue rows: ${pendingDigest}`)
  console.log(`[cleanup] pending OutboundEmail rows to these addresses: ${pendingOutbound}`)

  const alreadyInactive = users.filter((u) => !u.isActive).length
  const toDeactivate = users.length - alreadyInactive
  console.log(`[cleanup] will deactivate ${toDeactivate} user(s) (${alreadyInactive} already inactive)`)

  if (!commit) {
    console.log('[cleanup] dry-run — no changes written. Re-run with --commit to apply.')
    return
  }

  const now = new Date()
  const [userRes, digestRes, outboundRes] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: userIds }, isActive: true },
      data: { isActive: false },
    }),
    prisma.emailDigestQueue.updateMany({
      where: { userId: { in: userIds }, sentAt: null },
      data: { sentAt: now },
    }),
    prisma.outboundEmail.updateMany({
      where: {
        status: 'PENDING',
        toEmail: { in: users.map((u) => u.email) },
      },
      data: { status: 'FAILED', error: 'cancelled: bogus recipient' },
    }),
  ])

  console.log(`[cleanup] deactivated ${userRes.count} user(s)`)
  console.log(`[cleanup] drained ${digestRes.count} pending digest row(s)`)
  console.log(`[cleanup] cancelled ${outboundRes.count} pending outbound email(s)`)
  console.log('[cleanup] done')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
