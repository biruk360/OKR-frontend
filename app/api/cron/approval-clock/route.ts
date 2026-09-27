import { NextRequest, NextResponse } from 'next/server'
import { runApprovalEscalations } from '@/lib/projects/approval-escalations'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Daily approval-clock escalation sweep (build spec §C3 + §5.3).
 * Fires CLIENT_APPROVAL_SLA_BREACH at SLA, SLA+3, SLA+7 business days for any
 * activity still sitting in APPROVAL_REQUESTED past its obligation SLA — each
 * threshold fires once per wait. Protected by CRON_SECRET.
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await runApprovalEscalations()
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
