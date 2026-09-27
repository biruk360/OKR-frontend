import { NextRequest, NextResponse } from 'next/server'
import { runConfidenceCalculation } from '@/lib/confidence-calc'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Bi-weekly confidence auto-calculation trigger.
 * Schedule this on the 1st and 15th of each month via cron.
 * Protected by CRON_SECRET (same as the weekly digest).
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await runConfidenceCalculation()
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
