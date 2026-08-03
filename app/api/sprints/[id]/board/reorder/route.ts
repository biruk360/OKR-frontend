import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound, apiForbidden, apiError, handleApiError } from '@/lib/api'
import { resolveParams } from '@/lib/resolve-route-params'
import { canEditSprint, type UserRole } from '@/lib/permissions'

type Params = { id: string }

/**
 * POST /api/sprints/[id]/board/reorder
 *
 * Accepts the new ordering for one or more columns and writes sprintPosition
 * values (1000, 2000, 3000 …) for every todo in the supplied lists.
 *
 * Body: { columnOrders: { [status: string]: string[] } }
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

    // Build all updates — each card in the list gets position = (index + 1) * 1000
    const updates: Array<{ id: string; sprintPosition: number }> = []
    for (const [, ids] of Object.entries(columnOrders)) {
      if (!Array.isArray(ids)) continue
      ids.forEach((todoId, i) => {
        updates.push({ id: todoId, sprintPosition: (i + 1) * 1000 })
      })
    }

    if (updates.length === 0) return apiSuccess(null, { message: 'No positions to update' })

    await prisma.$transaction(
      updates.map(({ id, sprintPosition }) =>
        prisma.todo.update({ where: { id, sprintId }, data: { sprintPosition } })
      )
    )

    return apiSuccess(null, { message: 'Board order saved' })
  } catch (error) {
    return handleApiError(error, 'POST /api/sprints/[id]/board/reorder')
  }
})
