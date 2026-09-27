import { NextRequest, NextResponse } from 'next/server'
import { runWeeklyDigest } from '@/lib/weekly-digest'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Weekly digest trigger. Hit this endpoint on Monday morning from a scheduler
 * (system cron). Protected by CRON_SECRET via withCronAuth — pass
 * `Authorization: Bearer <secret>` (the `?key=` query form is no longer accepted).
 *
 * The job is idempotent within a calendar day — `email_digest_state` prevents duplicate sends.
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await runWeeklyDigest()
  return NextResponse.json({ success: true, ...result })
})

// Also accept GET so a vercel cron / curl can poke it without crafting a body.
export const GET = POST
