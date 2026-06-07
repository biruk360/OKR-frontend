import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, apiNotFound, handleApiError } from '@/lib/api'
import { resolveParams } from '@/lib/resolve-route-params'

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
 */
export const POST = withAuth<Params>(async (req: NextRequest, { params }) => {
  try {
    const { id: sprintId } = await resolveParams(params)
    if (!sprintId) return apiBadRequest('Invalid sprint id')

    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { id: true } })
    if (!sprint) return apiNotFound('Sprint not found')

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
