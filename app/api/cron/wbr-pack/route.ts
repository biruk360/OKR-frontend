import { NextRequest, NextResponse } from 'next/server'
import { emitNow } from '@/lib/notifications'
import { generateWbrPack } from '@/lib/projects/wbr-report'
import { withCronAuth } from '@/lib/cron-auth'

// Auth: withCronAuth (lib/cron-auth.ts) — `Authorization: Bearer $CRON_SECRET`, fail-closed.
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await generateWbrPack({ actorId: 'system' })
  if (result.created) {
    await emitNow('WBR_PACK_READY', {
      actorId: 'system',
      entityType: 'PROJECT',
      entityId: result.report.id,
      entityTitle: 'Weekly Business Review',
      explicitRecipients: result.recipients,
      data: { reportId: result.report.id, deepLink: '/dashboard/projects/portfolio' },
    })
  }
  return NextResponse.json({
    success: true,
    created: result.created,
    reportId: result.report.id,
    recipients: result.recipients.length,
  })
})

export const GET = POST
