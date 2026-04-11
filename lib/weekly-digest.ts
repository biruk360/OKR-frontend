import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/email'
import { isCheckInOverdue, type CheckInCadence } from '@/lib/check-in-cadence'

interface DigestEntity {
  kind: 'OBJECTIVE' | 'KEY_RESULT'
  id: string
  title: string
  cadence: CheckInCadence
  lastUpdate: Date
  progress: number
  confidence?: string
}

/**
 * Build the digest payload for a single user. Currently aggregates:
 *   - Objectives owned by the user
 *   - Key results owned by the user
 *   - Each tagged with whether their next check-in is overdue (per cadence)
 * Returns null if the user has nothing to remind about.
 */
export async function buildUserDigest(userId: string): Promise<{
  entities: DigestEntity[]
  overdue: DigestEntity[]
  initiatives: { id: string; title: string; status: string }[]
} | null> {
  const [objectives, keyResults, openInitiatives] = await Promise.all([
    prisma.objective.findMany({
      where: { ownerId: userId, status: 'ACTIVE' },
      select: { id: true, title: true, checkInCadence: true, updatedAt: true, progress: true, goalStatus: true },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: userId, status: 'ACTIVE' },
      select: { id: true, title: true, checkInCadence: true, updatedAt: true, progress: true, confidence: true },
    }),
    prisma.todo.findMany({
      where: {
        OR: [{ assigneeId: userId }, { creatorId: userId }],
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      select: { id: true, title: true, status: true },
      take: 50,
    }),
  ])

  const entities: DigestEntity[] = [
    ...objectives.map((o): DigestEntity => ({
      kind: 'OBJECTIVE',
      id: o.id,
      title: o.title,
      cadence: (o.checkInCadence as CheckInCadence) || 'WEEKLY',
      lastUpdate: o.updatedAt,
      progress: o.progress,
      confidence: o.goalStatus,
    })),
    ...keyResults.map((kr): DigestEntity => ({
      kind: 'KEY_RESULT',
      id: kr.id,
      title: kr.title,
      cadence: (kr.checkInCadence as CheckInCadence) || 'WEEKLY',
      lastUpdate: kr.updatedAt,
      progress: kr.progress,
      confidence: kr.confidence,
    })),
  ]

  const overdue = entities.filter((e) => isCheckInOverdue(e.cadence, e.lastUpdate))

  if (entities.length === 0 && openInitiatives.length === 0) return null

  return { entities, overdue, initiatives: openInitiatives }
}

function renderDigestText(name: string, digest: NonNullable<Awaited<ReturnType<typeof buildUserDigest>>>): string {
  const lines: string[] = []
  lines.push(`Hi ${name},`)
  lines.push('')
  lines.push('Here is your weekly OKR digest.')
  lines.push('')
  lines.push(`Owned objectives: ${digest.entities.filter((e) => e.kind === 'OBJECTIVE').length}`)
  lines.push(`Owned key results: ${digest.entities.filter((e) => e.kind === 'KEY_RESULT').length}`)
  lines.push(`Open initiatives: ${digest.initiatives.length}`)
  lines.push('')

  if (digest.overdue.length > 0) {
    lines.push(`⚠️  ${digest.overdue.length} item(s) need a check-in:`)
    for (const e of digest.overdue.slice(0, 20)) {
      const tag = e.kind === 'OBJECTIVE' ? '[Obj]' : '[KR]'
      lines.push(`  ${tag} ${e.title} — last updated ${e.lastUpdate.toISOString().slice(0, 10)} (cadence: ${e.cadence})`)
    }
  } else {
    lines.push('All your check-ins are up to date — nice work.')
  }
  lines.push('')
  lines.push('— OKR Management System')
  return lines.join('\n')
}

function renderDigestHtml(name: string, digest: NonNullable<Awaited<ReturnType<typeof buildUserDigest>>>): string {
  const overdueRows = digest.overdue
    .slice(0, 20)
    .map(
      (e) => `<tr>
        <td style="padding:4px 8px;font-size:12px;color:#6b7280;">${e.kind === 'OBJECTIVE' ? 'Objective' : 'Key result'}</td>
        <td style="padding:4px 8px;font-size:13px;color:#111827;"><strong>${escapeHtml(e.title)}</strong></td>
        <td style="padding:4px 8px;font-size:12px;color:#6b7280;">last update ${e.lastUpdate.toISOString().slice(0, 10)}</td>
        <td style="padding:4px 8px;font-size:12px;color:#6b7280;">cadence: ${e.cadence}</td>
      </tr>`
    )
    .join('')

  return `<!doctype html>
<html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f9fafb;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;">
    <h2 style="margin:0 0 8px;color:#111827;">Your weekly OKR digest</h2>
    <p style="margin:0 0 16px;color:#374151;">Hi ${escapeHtml(name)}, here's where your OKRs stand this week.</p>
    <ul style="margin:0 0 16px;padding-left:18px;color:#374151;font-size:14px;">
      <li>${digest.entities.filter((e) => e.kind === 'OBJECTIVE').length} owned objective(s)</li>
      <li>${digest.entities.filter((e) => e.kind === 'KEY_RESULT').length} owned key result(s)</li>
      <li>${digest.initiatives.length} open initiative(s)</li>
    </ul>
    ${
      digest.overdue.length > 0
        ? `<h3 style="margin:16px 0 4px;color:#b45309;font-size:14px;">${digest.overdue.length} check-in(s) overdue</h3>
           <table style="width:100%;border-collapse:collapse;border:1px solid #f3f4f6;">${overdueRows}</table>`
        : '<p style="color:#059669;font-weight:500;">All your check-ins are up to date — nice work.</p>'
    }
    <p style="margin-top:24px;color:#9ca3af;font-size:11px;">Sent by the OKR Management System weekly digest.</p>
  </div>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

/**
 * Generate and queue digests for every active user. Idempotent within a calendar day —
 * `email_digest_state.lastSentAt` blocks duplicate sends if invoked twice on the same day.
 */
export async function runWeeklyDigest(): Promise<{ generated: number; skipped: number; errors: number }> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, name: true },
  })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  let generated = 0
  let skipped = 0
  let errors = 0

  for (const user of users) {
    try {
      const state = await prisma.emailDigestState.findUnique({ where: { userId: user.id } })
      if (state?.lastSentAt && state.lastSentAt >= startOfToday) {
        skipped++
        continue
      }

      const digest = await buildUserDigest(user.id)
      if (!digest) {
        skipped++
        continue
      }

      const text = renderDigestText(user.name, digest)
      const html = renderDigestHtml(user.name, digest)

      await sendMail({
        to: user.email,
        toName: user.name,
        subject: 'Your weekly OKR digest',
        text,
        html,
        template: 'weekly-digest',
        metadata: {
          userId: user.id,
          overdueCount: digest.overdue.length,
          ownedObjectives: digest.entities.filter((e) => e.kind === 'OBJECTIVE').length,
          ownedKeyResults: digest.entities.filter((e) => e.kind === 'KEY_RESULT').length,
        },
      })

      await prisma.emailDigestState.upsert({
        where: { userId: user.id },
        create: { userId: user.id, lastSentAt: new Date(), lastDigestCadence: 'WEEKLY' },
        update: { lastSentAt: new Date(), lastDigestCadence: 'WEEKLY' },
      })
      generated++
    } catch (err) {
      console.error('[weekly-digest] error for user', user.id, err)
      errors++
    }
  }

  return { generated, skipped, errors }
}
