import { NextRequest, NextResponse } from 'next/server'
import { runProjectDigest } from '@/lib/projects/project-digest'

/**
 * Daily project-digest cron (build spec §5.3, daily 07:00).
 * Sends each project manager a digest of overdue activities, blocked work,
 * waiting approvals, upcoming due dates, failed gates, overdue payments,
 * open high-risk RAID items, and overdue COEs across their projects.
 * Protected by CRON_SECRET.
 */
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

  const result = await runProjectDigest()
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
