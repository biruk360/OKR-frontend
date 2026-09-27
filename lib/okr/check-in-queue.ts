/**
 * "Needs a check-in" queue for My OKRs (/dashboard/my-okrs).
 *
 * The same rule as the home page's check-in banner (app/dashboard/page.tsx):
 * the viewer's own ACTIVE key results on ACTIVE objectives, classified by
 * lib/okr/dashboard-home.ts `summarizeCheckInsDue` (last check-in — by anyone —
 * or creation, + KeyResult.checkInCadence). Overdue first, then due within 7 days.
 *
 * The viewer owns every KR listed, so KR titles are theirs to read; the parent
 * objective's title goes through the OKR visibility redaction (a private
 * objective owned by someone else shows the `[Private …]` title).
 */

import { prisma } from '@/lib/prisma'
import { summarizeCheckInsDue, type CheckInDueState } from '@/lib/okr/dashboard-home'
import { loadViewerContext, redactObjectiveForViewer } from '@/lib/okr/visibility-scope'

export interface CheckInQueueItem {
  id: string
  title: string
  state: CheckInDueState
  progress: number
  confidence: string
  objectiveId: string
  objectiveTitle: string
}

export interface CheckInQueue {
  overdueCount: number
  dueThisWeekCount: number
  items: CheckInQueueItem[]
}

export async function loadCheckInQueue(viewer: { id: string; role: string }, now: Date = new Date()): Promise<CheckInQueue> {
  const krs = await prisma.keyResult.findMany({
    where: { ownerId: viewer.id, status: 'ACTIVE', objective: { status: 'ACTIVE' } },
    select: {
      id: true,
      title: true,
      progress: true,
      confidence: true,
      checkInCadence: true,
      createdAt: true,
      objective: { select: { id: true, title: true, ownerId: true, isPrivate: true } },
    },
  })
  if (krs.length === 0) return { overdueCount: 0, dueThisWeekCount: 0, items: [] }

  // Latest check-in per KR (by anyone) — the cadence clock restarts on a check-in.
  const [latest, ctx] = await Promise.all([
    prisma.keyResultCheckIn.groupBy({
      by: ['keyResultId'],
      where: { keyResultId: { in: krs.map((k) => k.id) } },
      _max: { createdAt: true },
    }),
    loadViewerContext({ id: viewer.id, role: viewer.role }),
  ])
  const lastByKr = new Map(latest.map((row) => [row.keyResultId, row._max.createdAt ?? null]))

  const due = summarizeCheckInsDue(
    krs.map((kr) => ({
      id: kr.id,
      checkInCadence: kr.checkInCadence,
      createdAt: kr.createdAt,
      lastCheckInAt: lastByKr.get(kr.id) ?? null,
    })),
    now,
  )

  const byId = new Map(krs.map((kr) => [kr.id, kr]))
  const items: CheckInQueueItem[] = []
  for (const { id, state } of due.items) {
    const kr = byId.get(id)
    if (!kr) continue
    items.push({
      id: kr.id,
      title: kr.title,
      state,
      progress: kr.progress,
      confidence: kr.confidence,
      objectiveId: kr.objective.id,
      objectiveTitle: redactObjectiveForViewer(ctx, kr.objective).title,
    })
  }

  return { overdueCount: due.overdueCount, dueThisWeekCount: due.dueThisWeekCount, items }
}
