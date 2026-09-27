import { NextRequest, NextResponse } from 'next/server'
import { pruneActivityLog } from '@/lib/activity-log'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Daily prune of activity_logs older than the retention window (default 540 days).
 * Override via ?days=NN. Protected by CRON_SECRET.
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const url = new URL(request.url)
  const daysParam = url.searchParams.get('days')
  const retentionDays = daysParam ? Math.max(1, parseInt(daysParam, 10)) : undefined
  const result = await pruneActivityLog({ retentionDays })
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
