import { NextRequest, NextResponse } from 'next/server'
import {
  runCheckinEscalation, runDigestDrain, runTimeframeWatcher, runTodoReminders,
  runAdminWeeklyHealth, runAdminMonthlyExecSummary, runPruneNotifications,
} from '@/lib/notifications/jobs'

/**
 * Unified cron endpoint — select the job via `?job=<name>`. Protected by CRON_SECRET.
 * Valid jobs: daily, weekly, monthly, escalation, todos, timeframes, admin-weekly, admin-monthly.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = request.headers.get('authorization') || ''
    const url = new URL(request.url)
    const key = auth.replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || ''
    if (key !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const job = new URL(request.url).searchParams.get('job') || 'daily'
  try {
    switch (job) {
      case 'daily': return NextResponse.json({ success: true, ...(await runDigestDrain('DAILY')) })
      case 'weekly': return NextResponse.json({ success: true, ...(await runDigestDrain('WEEKLY')) })
      case 'monthly': return NextResponse.json({ success: true, ...(await runDigestDrain('MONTHLY')) })
      case 'escalation': return NextResponse.json({ success: true, ...(await runCheckinEscalation()) })
      case 'todos': return NextResponse.json({ success: true, ...(await runTodoReminders()) })
      case 'timeframes': return NextResponse.json({ success: true, ...(await runTimeframeWatcher()) })
      case 'admin-weekly': return NextResponse.json({ success: true, ...(await runAdminWeeklyHealth()) })
      case 'admin-monthly': return NextResponse.json({ success: true, ...(await runAdminMonthlyExecSummary()) })
      case 'prune-notifications': return NextResponse.json({ success: true, ...(await runPruneNotifications()) })
      default: return NextResponse.json({ error: 'unknown job' }, { status: 400 })
    }
  } catch (err) {
    console.error('[cron] job failed', job, err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export const GET = POST
