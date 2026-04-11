import { NextRequest, NextResponse } from 'next/server'
import { runWeeklyDigest } from '@/lib/weekly-digest'

/**
 * Weekly digest trigger. Hit this endpoint on Monday morning from a scheduler
 * (vercel cron, system cron, etc). Protected by a shared secret in CRON_SECRET
 * — pass via `Authorization: Bearer <secret>` or `?key=<secret>`.
 *
 * The job is idempotent within a calendar day — `email_digest_state` prevents duplicate sends.
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

  const result = await runWeeklyDigest()
  return NextResponse.json({ success: true, ...result })
}

// Also accept GET so a vercel cron / curl can poke it without crafting a body.
export const GET = POST
