import { NextRequest, NextResponse } from 'next/server'
import { syncActiveJiraConnections } from '@/features/projects/services/jira/sync'

/**
 * Jira sync sweep (build spec §G2, every 30 min).
 * Protected by CRON_SECRET. Each active connection writes a JiraSyncLog even on failure.
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

  const result = await syncActiveJiraConnections({ trigger: 'CRON' })
  return NextResponse.json({ success: true, ...result })
}

export const GET = POST
