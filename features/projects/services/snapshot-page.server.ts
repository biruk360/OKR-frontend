// Server-only: imports Prisma. Do not re-export from the features/projects
// barrel, which client components import. (The `server-only` package is not
// installed; this comment is the marker.)
/**
 * Data loader for the public snapshot page app/projects/snapshots/[snapshotId].
 * Moved verbatim from the page (CLAUDE.md: routes are thin composition): only an
 * APPROVED PUBLIC_SNAPSHOT report is served; anything else renders not-found.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export interface SnapshotActivity { id: string; parentActivityId: string | null; title: string; currentStart: string | Date | null; currentEnd: string | Date | null; status: string; percentComplete: number; priority: string | null; risk: string | null; isBlocked: boolean }
export interface SnapshotData { capturedAt: string; project: { code: string; name: string; clientName: string; plannedStart: string | Date; plannedEnd: string | Date; ragStatus: string; percentComplete: number; phases: Array<{ id: string; name: string; milestones: Array<{ id: string; name: string; activities: SnapshotActivity[] }> }> } }

/** Loads the approved public snapshot; throws notFound() when there is none. */
export async function loadPublicSnapshotPage(snapshotId: string) {
  const report = await prisma.projectReport.findFirst({ where: { id: snapshotId, type: 'PUBLIC_SNAPSHOT', status: 'APPROVED' }, select: { contentJson: true, generatedAt: true } })
  if (!report) notFound()
  const snapshot = report.contentJson as unknown as SnapshotData
  return { report, snapshot }
}
