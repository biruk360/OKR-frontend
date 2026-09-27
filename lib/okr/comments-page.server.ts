// Server-only: imports Prisma. (The `server-only` package is not installed;
// this comment is the marker.)
/**
 * Loader for /dashboard/comments. Moved verbatim from the page (CLAUDE.md:
 * routes are thin composition): EMPLOYEE sees comments on objectives / key
 * results they own; every other role sees the latest 100 comments.
 */

import { prisma } from '@/lib/prisma'

const COMMENT_INCLUDE = {
  author: { select: { id: true, name: true, avatar: true } },
  objective: { select: { id: true, title: true } },
  keyResult: { select: { id: true, title: true } },
} as const

export async function loadCommentsPage(viewer: { id: string; role: string }) {
  let comments: any[] = []

  if (viewer.role === 'EMPLOYEE') {
    const userObjectives = await prisma.objective.findMany({
      where: { ownerId: viewer.id },
      select: { id: true },
    })
    const objectiveIds = userObjectives.map((o) => o.id)

    const userKeyResults = await prisma.keyResult.findMany({
      where: { ownerId: viewer.id },
      select: { id: true },
    })
    const keyResultIds = userKeyResults.map((kr) => kr.id)

    comments = await prisma.comment.findMany({
      where: {
        OR: [
          { objectiveId: { in: objectiveIds } },
          { keyResultId: { in: keyResultIds } },
        ],
      },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  } else {
    comments = await prisma.comment.findMany({
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeek = comments.filter((c) => new Date(c.createdAt) > weekAgo).length
  const activeUsers = new Set(comments.map((c) => c.authorId)).size

  return { comments, thisWeek, activeUsers }
}
