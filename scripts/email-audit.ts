/**
 * Diagnostic: report every email the app has tried to send in the last N days,
 * plus the current state of potentially-fake users. Read-only — safe to run anywhere.
 *
 * Usage:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/email-audit.ts
 *   npx tsx --env-file=.env --env-file=.env.local scripts/email-audit.ts --hours=72
 */

import { prisma } from '../lib/prisma'

const SUSPECT_SUFFIXES = ['@company.com']
const SUSPECT_EXACT = [
  'unassigned@360ground.com',
  'delivery@360ground.com',
  'all.ses@360ground.com',
  'finance@360ground.com',
  'hr@360ground.com',
  'wessagn@360ground.com',
  'pm.lead@360ground.com',
  'kalkidan@360ground.com',
  'biruk.hailu@360ground.et',
]

function parseHours(): number {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--hours=')) return Number(a.slice(8))
  }
  return 48
}

async function main() {
  const hours = parseHours()
  const since = new Date(Date.now() - hours * 3600_000)
  console.log(`[audit] scanning sends since ${since.toISOString()} (last ${hours}h)\n`)

  // Part 1: every outbound email in window, grouped by recipient + status.
  const recent = await prisma.outboundEmail.findMany({
    where: { createdAt: { gte: since } },
    select: {
      toEmail: true, subject: true, status: true, error: true,
      template: true, createdAt: true, sentAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  console.log(`[audit] ${recent.length} outbound_emails row(s) in window`)
  if (recent.length > 0) {
    const byRecipient = new Map<string, typeof recent>()
    for (const r of recent) {
      if (!byRecipient.has(r.toEmail)) byRecipient.set(r.toEmail, [])
      byRecipient.get(r.toEmail)!.push(r)
    }
    console.log(`[audit] unique recipients: ${byRecipient.size}\n`)
    for (const [email, rows] of Array.from(byRecipient.entries()).sort()) {
      const statuses = rows.reduce((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m }, {} as Record<string, number>)
      const statusStr = Object.entries(statuses).map(([k, v]) => `${k}=${v}`).join(' ')
      console.log(`  ${email.padEnd(36)} sends=${rows.length.toString().padStart(3)} (${statusStr})`)
      const last = rows[0]
      console.log(`     last: ${last.createdAt.toISOString()}  template=${last.template ?? '—'}  subj="${last.subject.slice(0, 60)}"`)
      if (last.error) console.log(`     err: ${last.error.slice(0, 120)}`)
    }
  }

  // Part 2: suspect users still present?
  console.log('\n[audit] suspect users currently in DB:')
  const suspects = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: SUSPECT_EXACT } },
        ...SUSPECT_SUFFIXES.map((s) => ({ email: { endsWith: s } })),
      ],
    },
    select: { id: true, email: true, name: true, isActive: true, role: true },
    orderBy: { email: 'asc' },
  })
  if (suspects.length === 0) {
    console.log('  (none)')
  } else {
    for (const u of suspects) {
      console.log(`  - ${u.email.padEnd(36)} active=${String(u.isActive).padEnd(5)} role=${u.role.padEnd(16)} name="${u.name}"`)
    }
  }

  // Part 3: what cron-driven queues still hold rows for these users?
  if (suspects.length > 0) {
    const suspectIds = suspects.map((s) => s.id)
    const pendingDigest = await prisma.emailDigestQueue.count({
      where: { userId: { in: suspectIds }, sentAt: null },
    })
    console.log(`\n[audit] pending EmailDigestQueue rows for suspects: ${pendingDigest}`)
  }

  // Part 4: count OutboundEmail rows ever sent to any suspect recipient, all-time.
  const allTime = await prisma.outboundEmail.count({
    where: {
      OR: [
        { toEmail: { in: SUSPECT_EXACT } },
        ...SUSPECT_SUFFIXES.map((s) => ({ toEmail: { endsWith: s } })),
      ],
    },
  })
  console.log(`\n[audit] all-time outbound_emails to any suspect address: ${allTime}`)

  console.log('\n[audit] done. nothing was modified.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
