import { NextRequest, NextResponse } from 'next/server'
import { emitNow } from '@/lib/notifications'
import { generateClientReportDraftsForActiveProjects } from '@/lib/projects/client-report'
import { withCronAuth } from '@/lib/cron-auth'

// Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`, fail-closed.
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await generateClientReportDraftsForActiveProjects()
  for (const notification of result.notifications) {
    await emitNow('CLIENT_REPORT_READY', {
      actorId: 'system',
      entityType: 'PROJECT',
      entityId: notification.projectId,
      entityTitle: notification.projectName,
      explicitRecipients: [notification.projectManagerId],
      data: { reportId: notification.reportId, deepLink: `/projects/${notification.projectId}` },
    })
  }
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
