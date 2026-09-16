/**
 * Shared API guards for the sprint module (BR-06).
 */

import { prisma } from '@/lib/prisma'
import { apiError, apiForbidden, apiNotFound } from '@/lib/api'
import { canEditSprint, type UserRole } from '@/lib/permissions'

/**
 * Returns a 409 SPRINT_CLOSED response when the sprint is COMPLETED or
 * CANCELLED, or null when the sprint is open (or missing — the caller's own
 * not-found handling applies).
 */
export async function sprintClosedGuard(sprintId: string) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    select: { state: true },
  })
  if (sprint && (sprint.state === 'COMPLETED' || sprint.state === 'CANCELLED')) {
    return apiError('This sprint is closed and read-only', { status: 409, code: 'SPRINT_CLOSED' })
  }
  return null
}

/**
 * Combined guard for sprint-mutating routes: existence, closed-state, and edit
 * permission in one call.
 *
 * Returns an error response to return verbatim, or null when the caller may
 * proceed. Mirrors the checks POST /api/sprints/[id]/board/reorder performs
 * inline — the column routes previously performed only `withAuth` +
 * `sprintClosedGuard`, which let any signed-in user create, rename or delete
 * another team's board columns.
 *
 * Spec: docs/trello_parity_sprint_board_REQUIREMENTS.md SEC-1 / API-3..5.
 */
export async function sprintEditGuard(
  sprintId: string,
  actor: { id: string; role: string },
  forbiddenMessage = 'Insufficient permissions to edit this sprint',
) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { participants: { select: { userId: true } } },
  })
  if (!sprint) return apiNotFound('Sprint not found')

  if (sprint.state === 'COMPLETED' || sprint.state === 'CANCELLED') {
    return apiError('This sprint is closed and read-only', { status: 409, code: 'SPRINT_CLOSED' })
  }

  const allowed = await canEditSprint(actor.role as UserRole, actor.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  if (!allowed) return apiForbidden(forbiddenMessage)

  return null
}
