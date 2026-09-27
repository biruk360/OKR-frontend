import { NextRequest, NextResponse } from 'next/server'
import {
  runCheckinEscalation, runDigestDrain, runTimeframeWatcher, runTodoReminders,
  runAdminWeeklyHealth, runAdminMonthlyExecSummary, runPruneNotifications,
} from '@/lib/notifications/jobs'
import { withCronAuth } from '@/lib/cron-auth'
import { apiBadRequest } from '@/lib/api/apiResponse'
import { handleApiError } from '@/lib/api/handleError'

/**
 * Unified cron endpoint — select the job via `?job=<name>`. Protected by CRON_SECRET.
 * Valid jobs: daily, weekly, monthly, escalation, todos, timeframes, admin-weekly, admin-monthly.
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const job = new URL(request.url).searchParams.get('job') || 'daily'
  try {
    switch (job) {
      // Runs every NOTIFICATION_BATCH_MINUTES (default 10). This is the drain
      // most users are on — BATCHED is the default cadence.
      case 'batch': return NextResponse.json({ success: true, ...(await runDigestDrain('BATCHED')) })
      case 'daily': return NextResponse.json({ success: true, ...(await runDigestDrain('DAILY')) })
      case 'weekly': return NextResponse.json({ success: true, ...(await runDigestDrain('WEEKLY')) })
      case 'monthly': return NextResponse.json({ success: true, ...(await runDigestDrain('MONTHLY')) })
      case 'escalation': return NextResponse.json({ success: true, ...(await runCheckinEscalation()) })
      case 'todos': return NextResponse.json({ success: true, ...(await runTodoReminders()) })
      case 'timeframes': return NextResponse.json({ success: true, ...(await runTimeframeWatcher()) })
      case 'admin-weekly': return NextResponse.json({ success: true, ...(await runAdminWeeklyHealth()) })
      case 'admin-monthly': return NextResponse.json({ success: true, ...(await runAdminMonthlyExecSummary()) })
      case 'prune-notifications': return NextResponse.json({ success: true, ...(await runPruneNotifications()) })
      default: return apiBadRequest(`Unknown job: ${job}`)
    }
  } catch (err) {
    return handleApiError(err, `cron/notifications job=${job}`)
  }
})

export const GET = POST
