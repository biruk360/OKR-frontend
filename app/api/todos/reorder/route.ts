import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/withAuth'
import { apiSuccess, apiBadRequest, handleApiError } from '@/lib/api'

/**
 * POST /api/todos/reorder
 *
 * Accepts the new ordering for one or more kanban columns and writes sortOrder
 * values (1000, 2000, 3000 …) for every todo in the supplied lists.
 *
 * Body: { columnOrders: { [status: string]: string[] } }
 *
 * Todos are scoped to the authenticated user (creator or assignee) — the DB
 * update silently skips rows the user does not own.
 */
export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const body = await req.json()
    const columnOrders: Record<string, string[]> = body?.columnOrders ?? {}

    if (!columnOrders || typeof columnOrders !== 'object') {
      return apiBadRequest('columnOrders must be an object mapping status → todoId[]')
    }

    const updates: Array<{ id: string; sortOrder: number }> = []
    for (const [, ids] of Object.entries(columnOrders)) {
      if (!Array.isArray(ids)) continue
      ids.forEach((todoId, i) => {
        updates.push({ id: todoId, sortOrder: (i + 1) * 1000 })
      })
    }

    if (updates.length === 0) return apiSuccess(null, { message: 'No positions to update' })

    await prisma.$transaction(
      updates.map(({ id, sortOrder }) =>
        prisma.todo.updateMany({
          where: { id },
          data: { sortOrder },
        })
      )
    )

    return apiSuccess(null, { message: 'Todo order saved' })
  } catch (error) {
    return handleApiError(error, 'POST /api/todos/reorder')
  }
})
