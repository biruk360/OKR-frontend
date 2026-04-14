import { NextRequest, NextResponse } from 'next/server'
import { pruneActivityLog } from '@/lib/activity-log'

/**
 * Daily prune of activity_logs older than the retention window (default 540 days).
 * Override via ?days=NN. Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = request.headers.get('authorization') || ''
    const url = new URL(request.url)
    const key = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || ''
    if (key !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const daysParam = url.searchParams.get('days')
  const retentionDays = daysParam ? Math.max(1, parseInt(daysParam, 10)) : undefined
  const result = await pruneActivityLog({ retentionDays })
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
