import { NextRequest, NextResponse } from 'next/server'
import { runTodoRecurrence } from '@/lib/todos/recurrence-generator'

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
 * Auth matches app/api/cron/todo-reminders: Bearer $CRON_SECRET, and a missing
 * secret is a 500 rather than an open door.
 */
export async function POST(request: NextRequest) { return handle(request) }
export async function GET(request: NextRequest) { return handle(request) }

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if ((request.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runTodoRecurrence()
  return NextResponse.json({ success: true, data: result })
}
