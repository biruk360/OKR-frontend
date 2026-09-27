import { NextRequest, NextResponse } from 'next/server'
import { runDailyAutoConfidence } from '@/lib/confidence-calc'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Daily auto-confidence recompute for OKRs that haven't been updated in >14 days.
 * Protected by CRON_SECRET (same as the other cron endpoints).
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await runDailyAutoConfidence()
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
