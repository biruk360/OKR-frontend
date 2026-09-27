import { NextRequest, NextResponse } from 'next/server'
import { runAutomationsTick } from '@/lib/automations/service'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Enqueue due automation slots. Cheap and idempotent by design — safe to call
 * every minute. All the slow work happens in the worker
 * (scripts/automations-worker.ts), never in this request.
 *
 * Spec: docs/AI_Automations_Requirements_v1.0.md §10.
 */
// Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`, fail-closed.
export const POST = withCronAuth(async (request: NextRequest) => {
  return NextResponse.json({ success: true, ...(await runAutomationsTick()) })
})

export const GET = POST
