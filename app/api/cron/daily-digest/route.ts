import { NextRequest, NextResponse } from 'next/server'
import { runDailyDigest } from '@/lib/daily-digest'

/**
 * Daily digest trigger. Hit this endpoint at 7am local time from a scheduler
 * (system cron). Protected by a shared secret in CRON_SECRET — pass via
 * `Authorization: Bearer <secret>` or `?key=<secret>`.
 *
 * The job is idempotent within a calendar day — `email_digest_state.lastSentAt`
 * combined with `lastDigestCadence='DAILY'` prevents duplicate sends.
 *
 * Skips sending to users who have nothing actionable (no today-actions, no
 * yesterday-activity, no upcoming-this-week items, no at-risk/off-track KRs).
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = request.headers.get('authorization') || ''
    const url = new URL(request.url)
    const key = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || ''
    if (key !== expected) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await runDailyDigest()
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
