import { NextRequest, NextResponse } from 'next/server'
import { runApprovalEscalations } from '@/lib/projects/approval-escalations'

/**
 * Daily approval-clock escalation sweep (build spec §C3 + §5.3).
 * Fires CLIENT_APPROVAL_SLA_BREACH at SLA, SLA+3, SLA+7 business days for any
 * activity still sitting in APPROVAL_REQUESTED past its obligation SLA — each
 * threshold fires once per wait. Protected by CRON_SECRET.
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

  const result = await runApprovalEscalations()
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
