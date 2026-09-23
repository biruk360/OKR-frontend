import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { sprintEditGuard } from '@/lib/sprints/guards'
import { recordActivity } from '@/lib/activity-log'

type ColParams = { id: string; colId: string } | Promise<{ id: string; colId: string }>

/**
 * POST /api/sprints/[id]/columns/[colId]/move-all?moveTo=<columnId>
 *
 * Empties one list into another (LST-3). Shares the archive route's re-home
 * semantics — cards adopt the destination's status and are appended in order —
 * but leaves both lists in place.
 *
 * A per-card PATCH from the client would work but would not renumber
 * sprintPosition, so the cards would arrive interleaved with whatever is
 * already there.
 */
export const POST = withAuth<ColParams>(async (request: NextRequest, { session, params }) => {
  const { id: sprintId, colId } = await resolveParams(params)
  if (!sprintId || !colId) return apiBadRequest('Invalid id')

  const denied = await sprintEditGuard(
    sprintId,
    { id: session.user.id, role: session.user.role },
    'Insufficient permissions to move cards in this sprint',
  )
  if (denied) return denied

  const moveTo = new URL(request.url).searchParams.get('moveTo')
  if (!moveTo) return apiBadRequest('moveTo is required')
  if (moveTo === colId) return apiBadRequest('Source and destination are the same list')

  const [source, destination] = await Promise.all([
    prisma.sprintColumn.findFirst({ where: { id: colId, sprintId }, select: { id: true, name: true } }),
    prisma.sprintColumn.findFirst({
      where: { id: moveTo, sprintId, archivedAt: null },
      select: { id: true, name: true, statusKey: true },
    }),
  ])
  if (!source) return apiNotFound('List not found in this sprint')
  if (!destination) return apiBadRequest('moveTo must be another active list in this sprint')

  const moving = await prisma.todo.findMany({
    where: { sprintId, columnId: colId },
    orderBy: [{ sprintPosition: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  if (moving.length === 0) return apiSuccess({ moved: 0 })

  await prisma.$transaction(async (tx) => {
    const last = await tx.todo.findFirst({
      where: { sprintId, columnId: destination.id },
      orderBy: { sprintPosition: 'desc' },
      select: { sprintPosition: true },
    })
    let position = (last?.sprintPosition ?? 0) + 1000
    for (const card of moving) {
      await tx.todo.update({
        where: { id: card.id },
        data: {
          columnId: destination.id,
          ...(destination.statusKey ? { status: destination.statusKey } : {}),
          sprintPosition: position,
        },
      })
      position += 1000
    }
  })

  await recordActivity({
    entityType: 'SPRINT',
    sprintId,
    action: 'TODO_MOVED_COLUMN',
    actorId: session.user.id,
    metadata: { from: source.name, to: destination.name, count: moving.length },
  })

  return apiSuccess({ moved: moving.length, to: destination.id })
})
