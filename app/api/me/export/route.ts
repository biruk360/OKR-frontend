import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'

/**
 * GET /api/me/export — the signed-in user's own data, as a JSON download.
 *
 * Scoped to the caller: every query is filtered by their own id, so this grants
 * no visibility they do not already have in the UI. It deliberately returns the
 * file directly rather than the `{ success, data }` envelope — the browser saves
 * the response, so an envelope would just be noise inside the downloaded file.
 */
export const GET = withAuth(async (_req, { session }) => {
  const userId = session.user.id

  const [user, objectives, keyResults, todos, checkIns, comments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, role: true,
        avatar: true, isActive: true, createdAt: true,
        departmentMemberships: { select: { department: { select: { id: true, name: true } } } },
      },
    }),
    prisma.objective.findMany({
      where: { ownerId: userId },
      select: {
        id: true, title: true, description: true, level: true, status: true,
        progress: true, createdAt: true, updatedAt: true,
        timeframe: { select: { name: true, startDate: true, endDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.keyResult.findMany({
      where: { ownerId: userId },
      select: {
        id: true, title: true, description: true, startValue: true, targetValue: true,
        currentValue: true, unit: true, confidence: true, status: true,
        createdAt: true, updatedAt: true,
        objective: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.todo.findMany({
      where: { OR: [{ assigneeId: userId }, { creatorId: userId }] },
      select: {
        id: true, cardNumber: true, title: true, description: true, status: true,
        priority: true, startDate: true, dueDate: true, completedAt: true,
        archivedAt: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.keyResultCheckIn.findMany({
      where: { createdById: userId },
      select: {
        id: true, asOfDate: true, value: true, confidence: true,
        confidenceScore: true, analysis: true, createdAt: true,
        keyResult: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.comment.findMany({
      where: { authorId: userId },
      select: { id: true, content: true, createdAt: true, objectiveId: true, keyResultId: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    // Bumped if the shape changes, so an old file is still identifiable.
    schemaVersion: 1,
    user,
    objectives,
    keyResults,
    todos,
    checkIns,
    comments,
    counts: {
      objectives: objectives.length,
      keyResults: keyResults.length,
      todos: todos.length,
      checkIns: checkIns.length,
      comments: comments.length,
    },
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="okr-export-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  })
})
