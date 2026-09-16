import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound, apiForbidden, apiError, handleApiError } from '@/lib/api'
import { resolveParams } from '@/lib/resolve-route-params'
import { canEditSprint, type UserRole } from '@/lib/permissions'
import { getSprintLanes } from '@/lib/sprints/columns'

type Params = { id: string }

/**
 * POST /api/sprints/[id]/board/reorder
 *
 * Accepts the new ordering for one or more columns and writes sprintPosition
 * values (1000, 2000, 3000 …) for every todo in the supplied lists.
 *
 * Body: { columnOrders: { [columnId: string]: string[] } }
 *
 * Keys are lane ids (SprintColumn.id). Each listed card is written into that
 * lane and given position (index + 1) * 1000. Because a lane carries a
 * statusKey, a cross-lane move also writes the card's `status` — in the SAME
 * transaction. Previously the client fired a separate PATCH /api/todos/[id]
 * for the status, so a failure between the two left a card in "Done" still
 * marked PENDING.
 *
 * Legacy status keys (PENDING, IN_PROGRESS, …) are still accepted and resolved
 * to that sprint's first matching lane, so older clients keep working.
 *
 * Only the ids explicitly listed are updated. Cards absent from the payload
 * keep their existing positions.
 *
 * BR-06: rejects on closed sprints (409 SPRINT_CLOSED) and requires edit rights.
 */
export const POST = withAuth<Params>(async (req: NextRequest, { session, params }) => {
  try {
    const { id: sprintId } = await resolveParams(params)
    if (!sprintId) return apiBadRequest('Invalid sprint id')

    const sprint = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: { participants: { select: { userId: true } } },
    })
    if (!sprint) return apiNotFound('Sprint not found')

    if (sprint.state === 'COMPLETED' || sprint.state === 'CANCELLED') {
      return apiError('This sprint is closed and read-only', { status: 409, code: 'SPRINT_CLOSED' })
    }

    const allowed = await canEditSprint(session.user.role as UserRole, session.user.id, {
      ownerId: sprint.ownerId,
      departmentId: sprint.departmentId,
      participants: sprint.participants,
    })
    if (!allowed) return apiForbidden('Insufficient permissions to reorder this board')

    const body = await req.json()
    const columnOrders: Record<string, string[]> = body?.columnOrders ?? {}

    if (!columnOrders || typeof columnOrders !== 'object') {
      return apiBadRequest('columnOrders must be an object mapping status → todoId[]')
    }

    const lanes = await getSprintLanes(sprintId)

    // Resolve each key to a lane: by lane id, else by statusKey (legacy clients).
    const updates: Array<{ id: string; sprintPosition: number; columnId: string; status: string | null }> = []
    for (const [key, ids] of Object.entries(columnOrders)) {
      if (!Array.isArray(ids)) continue
      const lane = lanes.find((l) => l.id === key) ?? lanes.find((l) => l.statusKey === key)
      if (!lane) {
        return apiBadRequest(`Unknown column "${key}" for this sprint`)
      }
      ids.forEach((todoId, i) => {
        updates.push({
          id: todoId,
          sprintPosition: (i + 1) * 1000,
          columnId: lane.id,
          status: lane.statusKey,
        })
      })
    }

    if (updates.length === 0) return apiSuccess(null, { message: 'No positions to update' })

    // Scoping every update by `sprintId` keeps a caller with rights on this
    // sprint from reordering cards belonging to another one.
    await prisma.$transaction(
      updates.map(({ id, sprintPosition, columnId, status }) =>
        prisma.todo.update({
          where: { id, sprintId },
          data: { sprintPosition, columnId, ...(status ? { status } : {}) },
        })
      )
    )

    return apiSuccess(null, { message: 'Board order saved' })
  } catch (error) {
    return handleApiError(error, 'POST /api/sprints/[id]/board/reorder')
  }
})
