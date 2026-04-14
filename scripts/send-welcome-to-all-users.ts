/**
 * Bulk-send the welcome / invitation email to every active user in the database.
 *
 * For each user:
 *   - Issues a fresh 7-day activation token (overwrites any existing one).
 *   - Sends the rich HTML invitation email (lib/email.sendUserInvitationEmail).
 *   - Logs result; continues on individual failures.
 *
 * Usage:
 *   # Dry-run (no token writes, no emails sent — preview only):
 *   npx tsx --env-file=.env --env-file=.env.local scripts/send-welcome-to-all-users.ts
 *
 *   # Live send:
 *   npx tsx --env-file=.env --env-file=.env.local scripts/send-welcome-to-all-users.ts --commit
 *
 * Optional filters:
 *   --only-inactive    Only send to users where isActive=false (haven't onboarded yet).
 *   --email=<addr>     Only send to one specific email (handy for validation).
 */

import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { sendMail } from '../lib/email'
import { renderInvitationEmail } from '../lib/email/templates/invitation'

interface Args {
  commit: boolean
  onlyInactive: boolean
  emailFilter: string | null
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Args = { commit: false, onlyInactive: false, emailFilter: null }
  for (const a of argv) {
    if (a === '--commit') args.commit = true
    else if (a === '--only-inactive') args.onlyInactive = true
    else if (a.startsWith('--email=')) args.emailFilter = a.slice('--email='.length).trim().toLowerCase() || null
  }
  return args
}

async function main() {
  const args = parseArgs()
  console.log('[welcome-bulk] mode:', args.commit ? 'COMMIT (live send)' : 'DRY-RUN (no writes, no emails)')
  if (args.onlyInactive) console.log('[welcome-bulk] filter: only inactive users')
  if (args.emailFilter) console.log('[welcome-bulk] filter: email =', args.emailFilter)

  const where: { isActive?: boolean; email?: string } = {}
  if (args.onlyInactive) where.isActive = false
  if (args.emailFilter) where.email = args.emailFilter

  const users = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[welcome-bulk] ${users.length} user(s) match`)

  let sent = 0, failed = 0, skipped = 0
  for (const u of users) {
    if (!u.email) { skipped++; console.log('  skip (no email):', u.id); continue }
    if (!args.commit) {
      console.log(`  would send → ${u.email} (${u.name}, ${u.role})`)
      continue
    }
    try {
      const token = crypto.randomBytes(32).toString('hex')
      await prisma.user.update({
        where: { id: u.id },
        data: {
          activationToken: token,
          activationTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })
      const base = process.env.NEXTAUTH_URL || 'http://localhost:3000'
      const rendered = renderInvitationEmail({
        name: u.name ?? 'there',
        email: u.email,
        role: u.role,
        activationUrl: `${base}/auth/reset-password?token=${token}`,
        expiresInHours: 168,
      })
      const result = await sendMail({
        to: u.email,
        toName: u.name ?? undefined,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        template: 'user-invitation',
        metadata: { role: u.role, bulk: true },
      })
      if (result.status === 'SENT' || result.status === 'LOGGED_ONLY') {
        console.log(`  ✓ ${result.status} → ${u.email}`)
        sent++
      } else {
        failed++
        console.error(`  ✗ ${result.status} → ${u.email}`)
      }
    } catch (err) {
      failed++
      console.error(`  ✗ failed → ${u.email}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log('---')
  console.log(`[welcome-bulk] sent=${sent} failed=${failed} skipped=${skipped} total=${users.length}`)
  if (!args.commit) console.log('[welcome-bulk] dry-run only — re-run with --commit to actually send.')
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('[welcome-bulk] fatal:', err)
  await prisma.$disconnect()
  process.exit(1)
})
