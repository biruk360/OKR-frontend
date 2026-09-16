import { NextRequest, NextResponse } from 'next/server'
import { runAutomationsTick } from '@/lib/automations/service'

/**
 * Enqueue due automation slots. Cheap and idempotent by design — safe to call
 * every minute. All the slow work happens in the worker
 * (scripts/automations-worker.ts), never in this request.
 *
 * Spec: docs/AI_Automations_Requirements_v1.0.md §10.
 */
function authorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected) return true
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace(/^Bearer\s+/i, '') || new URL(request.url).searchParams.get('key') || ''
  return key === expected
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ success: true, ...(await runAutomationsTick()) })
}

export const GET = POST
