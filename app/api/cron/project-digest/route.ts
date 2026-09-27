import { NextRequest, NextResponse } from 'next/server'
import { runProjectDigest } from '@/lib/projects/project-digest'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Daily project-digest cron (build spec §5.3, daily 07:00).
 * Sends each project manager a digest of overdue activities, blocked work,
 * waiting approvals, upcoming due dates, failed gates, overdue payments,
 * open high-risk RAID items, and overdue COEs across their projects.
 * Protected by CRON_SECRET.
 */
export const POST = withCronAuth(async (request: NextRequest) => {
  const result = await runProjectDigest()
  return NextResponse.json({ success: true, ...result })
})

export const GET = POST
