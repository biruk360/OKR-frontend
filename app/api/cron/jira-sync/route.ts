import { NextRequest, NextResponse } from 'next/server'
import { syncActiveJiraConnections } from '@/features/projects/services/jira/sync'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Jira sync sweep (build spec §G2, every 30 min).
 * Protected by CRON_SECRET. Each active connection writes a JiraSyncLog even on failure.
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await syncActiveJiraConnections({ trigger: 'CRON' })
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
