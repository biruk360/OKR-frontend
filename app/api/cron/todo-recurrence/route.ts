import { NextRequest, NextResponse } from 'next/server'
import { runTodoRecurrence } from '@/lib/todos/recurrence-generator'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Recurring-card generator (DTE-5).
 *
 * Daily is enough: recurrence has day-level granularity, unlike the reminder
 * sweep, which runs every five minutes to honour a 5-minute lead time. The
 * generator is
 * idempotent — a series only advances when its next occurrence falls inside the
 * horizon, and the head's dueDate cursor advances in the same transaction that
 * creates the cards, so a re-run on the same day is a no-op.
 *
 * Auth: withCronAuth (lib/cron-auth.ts) — Bearer $CRON_SECRET; a missing
 * secret is a 503 rather than an open door.
 */

async function handle(request: NextRequest) {
  const result = await runTodoRecurrence()
  return NextResponse.json({ success: true, data: result })
}

export const POST = withCronAuth(handle)
export const GET = POST
