// Server-only: imports Prisma. (The `server-only` package is not installed;
// this comment is the marker.)
/**
 * Loader for /dashboard/activity — real `ActivityLog` rows scoped with
 * lib/okr/visibility-scope.ts to objectives/KRs the viewer sees UNREDACTED,
 * since a log row's change diff cannot be redacted. Keyset-paginated by
 * `createdAt`. Moved verbatim from the page (CLAUDE.md: routes are thin).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildKeyResultVisibilityWhere,
  buildObjectiveVisibilityWhere,
  loadViewerContext,
} from '@/lib/okr/visibility-scope'

export const ACTIVITY_FEED_PAGE_SIZE = 50

/** Actions that are noise in a workspace feed (view beacons are per-user telemetry). */
const HIDDEN_ACTIONS = ['VIEWED']

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function loadActivityFeedPage(
  viewer: { id: string; role: string },
  beforeRaw: string | undefined,
) {
  const beforeParam = beforeRaw ? new Date(beforeRaw) : null
  const before = beforeParam && !Number.isNaN(beforeParam.getTime()) ? beforeParam : null

  const ctx = await loadViewerContext({ id: viewer.id, role: viewer.role })
  const objectiveWhere = buildObjectiveVisibilityWhere(ctx, { includeRedacted: false })
  const keyResultWhere = buildKeyResultVisibilityWhere(ctx, { includeRedacted: false })

  const where: Prisma.ActivityLogWhereInput = {
    AND: [
      { entityType: { in: ['OBJECTIVE', 'KEY_RESULT'] } },
      { action: { notIn: HIDDEN_ACTIONS } },
      { OR: [{ objectiveId: { not: null } }, { keyResultId: { not: null } }] },
      // Every OKR the row links to must be visible in full.
      { OR: [{ objectiveId: null }, { objective: objectiveWhere }] },
      { OR: [{ keyResultId: null }, { keyResult: keyResultWhere }] },
      ...(before ? [{ createdAt: { lt: before } }] : []),
    ],
  }

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: ACTIVITY_FEED_PAGE_SIZE + 1,
    select: {
      id: true,
      action: true,
      metadata: true,
      createdAt: true,
      actor: { select: { id: true, name: true, avatar: true } },
      objective: { select: { id: true, title: true } },
      keyResult: { select: { id: true, title: true } },
    },
  })
  const hasMore = logs.length > ACTIVITY_FEED_PAGE_SIZE
  const page = hasMore ? logs.slice(0, ACTIVITY_FEED_PAGE_SIZE) : logs

  // Comment bodies for COMMENTED rows, in one query.
  const commentIds = page
    .map((l) => (l.action === 'COMMENTED' ? (l.metadata as Record<string, unknown> | null)?.commentId : null))
    .filter((id): id is string => typeof id === 'string')
  const comments = commentIds.length
    ? await prisma.comment.findMany({ where: { id: { in: commentIds } }, select: { id: true, content: true } })
    : []
  const commentById = new Map(comments.map((c) => [c.id, plainText(c.content)]))

  const nextBefore = hasMore ? page[page.length - 1].createdAt.toISOString() : null

  return { before, page, commentById, nextBefore }
}
