import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { withCronAuth } from '@/lib/cron-auth'

/**
 * Sprint v2 lifecycle tick.
 *
 * Hit hourly via VPS cron — scheduled by scripts/install-crontab.sh (which
 * sends the header in double quotes so $CRON_SECRET actually expands).
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

async function handle(request: NextRequest) {
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

export const POST = withCronAuth(handle)
export const GET = POST
