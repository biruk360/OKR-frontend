import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, apiForbidden, withAuth } from '@/lib/api'
import { canViewSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'

/**
 * POST /api/todos/[id]/share — record that a card link was copied and return
 * the canonical deep link.
 *
 * This creates **no new access path**: the link is an ordinary in-app URL under
 * /dashboard, which the existing layout guard and `canViewSprint` already
 * protect. There is no token, and holding the link grants nothing. The endpoint
 * exists so sharing is auditable (SHR-7) and so the URL shape lives in one place.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md SHR-1, SHR-3, SHR-7, SEC-4/5.
 */
export const POST = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: {
      id: true,
      sprintId: true,
      sprint: {
        select: {
          id: true, ownerId: true, departmentId: true,
          participants: { select: { userId: true } },
        },
      },
    },
  })
  // SEC-5 — not-found and forbidden are indistinguishable, so a deep link
  // cannot be used to probe which card ids exist.
  if (!todo || !todo.sprint) return apiNotFound('Card not available')

  const allowed = await canViewSprint(session.user.role as UserRole, session.user.id, {
    ownerId: todo.sprint.ownerId,
    departmentId: todo.sprint.departmentId,
    participants: todo.sprint.participants,
  })
  if (!allowed) return apiNotFound('Card not available')

  await recordActivity({
    entityType: 'TODO',
    todoId: todo.id,
    sprintId: todo.sprint.id,
    action: 'TODO_SHARED',
    actorId: session.user.id,
  })

  return apiSuccess({ path: `/dashboard/sprints/${todo.sprint.id}?card=${todo.id}` })
})
