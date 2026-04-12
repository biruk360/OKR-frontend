import { NextRequest, NextResponse } from 'next/server'
import { runConfidenceCalculation } from '@/lib/confidence-calc'

/**
 * Bi-weekly confidence auto-calculation trigger.
 * Schedule this on the 1st and 15th of each month via cron.
 * Protected by CRON_SECRET (same as the weekly digest).
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

  const result = await runConfidenceCalculation()
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
