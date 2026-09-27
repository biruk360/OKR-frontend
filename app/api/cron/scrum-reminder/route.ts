import { NextRequest, NextResponse } from 'next/server'
import { runScrumReminder } from '@/features/scrum/services/scrum-jobs'
import { withCronAuth } from '@/lib/cron-auth'

// Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`, fail-closed.
export const POST = withCronAuth(async (request: NextRequest) => {
  return NextResponse.json({ success: true, ...(await runScrumReminder()) })
})

export const GET = POST
