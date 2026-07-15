import { NextRequest, NextResponse } from 'next/server'
import { emit } from '@/lib/notifications'
import { generateWbrPack } from '@/lib/projects/wbr-report'

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

  const result = await generateWbrPack({ actorId: 'system' })
  if (result.created) {
    await emit('WBR_PACK_READY', {
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
}

export const GET = POST
