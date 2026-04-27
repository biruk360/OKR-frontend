import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'

/**
 * Sprint v2 lifecycle tick.
 *
 * Hit hourly via VPS cron — NOT YET wired in production. Add to crontab:
 *   0 * * * * curl -H 'Authorization: Bearer $CRON_SECRET' https://your-host/api/cron/sprint-tick
 *
 * Authentication: shared secret in `Authorization: Bearer <CRON_SECRET>` header.
 *
 * Behavior:
 *   - PLANNING sprints whose startDate has passed are flipped to ACTIVE.
 *     A SPRINT_STARTED activity log entry is recorded.
 *   - ACTIVE sprints whose endDate is past are NOT auto-ended — that flow
 *     requires owner input (incomplete-handling) via /api/sprints/[id]/end.
 *     Phase 4 will emit a notification here.
 */
export async function POST(request: NextRequest) {
  return handle(request)
}
export async function GET(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ success: false, error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = request.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const toStart = await prisma.sprint.findMany({
    where: { state: 'PLANNING', startDate: { lte: now } },
    select: { id: true },
  })
  for (const s of toStart) {
    await prisma.sprint.update({ where: { id: s.id }, data: { state: 'ACTIVE' } })
    await recordActivity({
      entityType: 'SPRINT', sprintId: s.id, action: 'SPRINT_STARTED',
      actorId: null,
      metadata: { source: 'cron' },
    })
  }

  const expired = await prisma.sprint.count({
    where: { state: 'ACTIVE', endDate: { lt: now } },
  })

  return NextResponse.json({ success: true, data: { started: toStart.length, expired } })
}
