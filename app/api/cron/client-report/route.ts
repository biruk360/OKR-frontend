import { NextRequest, NextResponse } from 'next/server'
import { emit } from '@/lib/notifications'
import { generateClientReportDraftsForActiveProjects } from '@/lib/projects/client-report'

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

  const result = await generateClientReportDraftsForActiveProjects()
  for (const notification of result.notifications) {
    await emit('CLIENT_REPORT_READY', {
      actorId: 'system',
      entityType: 'PROJECT',
      entityId: notification.projectId,
      entityTitle: notification.projectName,
      explicitRecipients: [notification.projectManagerId],
      data: { reportId: notification.reportId, deepLink: `/dashboard/projects/${notification.projectId}` },
    })
  }
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
