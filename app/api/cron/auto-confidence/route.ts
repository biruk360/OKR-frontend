import { NextRequest, NextResponse } from 'next/server'
import { runDailyAutoConfidence } from '@/lib/confidence-calc'

/**
 * Daily auto-confidence recompute for OKRs that haven't been updated in >14 days.
 * Protected by CRON_SECRET (same as the other cron endpoints).
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

  const result = await runDailyAutoConfidence()
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
