import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { canEditSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { canReopen, buildBringBackPatch, REOPEN_WINDOW_DAYS } from '@/lib/sprints/end-sprint'

/**
 * POST /api/sprints/[id]/reopen — reopen a COMPLETED sprint within the window (BR-08).
 *
 * Body (optional): { bringBackTodoIds?: string[] } — tasks previously carried to a
 * next sprint that should return to this one (carryoverCount decremented, floor 0).
 *
 * Dispositioned tasks are NOT auto-returned; the response includes the close
 * summary so the UI can offer per-task bring-back.
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const body = await request.json().catch(() => ({}))
  const bringBackTodoIds: string[] = Array.isArray(body.bringBackTodoIds)
    ? body.bringBackTodoIds.filter((x: unknown) => typeof x === 'string')
    : []

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      participants: { select: { userId: true } },
      completionSummary: true,
    },
  })
  if (!sprint) return apiNotFound('Sprint not found')

  if (sprint.state !== 'COMPLETED') {
    return apiError('Only COMPLETED sprints can be reopened', { status: 409, code: 'SPRINT_NOT_COMPLETED' })
  }

  const role = session.user.role as UserRole
  const allowed = await canEditSprint(role, session.user.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  if (!allowed) return apiForbidden('Insufficient permissions to reopen this sprint')

  const now = new Date()
  if (!canReopen(sprint.endedAt, now)) {
    return apiError(`Sprints can only be reopened within ${REOPEN_WINDOW_DAYS} days of closing`, {
      status: 409,
      code: 'REOPEN_WINDOW_EXPIRED',
    })
  }

  // Validate bring-back targets: they must have been carried OUT of this sprint
  // (present in the summary dispositions with action 'next').
  let dispositions: { todoId: string; title: string; action: string; toSprintId: string | null }[] = []
  if (sprint.completionSummary?.dispositions) {
    try {
      const parsed = JSON.parse(sprint.completionSummary.dispositions)
      if (Array.isArray(parsed)) dispositions = parsed
    } catch { /* legacy/unparseable — treated as no dispositions */ }
  }
  const carriedOut = new Map(dispositions.filter(d => d.action === 'next').map(d => [d.todoId, d]))
  const invalidBringBack = bringBackTodoIds.find(tid => !carriedOut.has(tid))
  if (invalidBringBack) {
    return apiBadRequest(`Todo ${invalidBringBack} was not carried out of this sprint`)
  }

  await prisma.$transaction(async (tx) => {
    if (sprint.completionSummary) {
      await tx.sprintCompletionSummary.update({
        where: { sprintId: id },
        data: { reopenedAt: now, reopenedById: session.user.id },
      })
    }
    await tx.sprint.update({
      where: { id },
      data: { state: 'ACTIVE', endedAt: null, endedById: null },
    })

    for (const todoId of bringBackTodoIds) {
      const todo = await tx.todo.findUnique({
        where: { id: todoId },
        select: { carryoverCount: true, sprintId: true },
      })
      if (!todo) continue
      const fromSprintId = todo.sprintId
      await tx.todo.update({
        where: { id: todoId },
        data: buildBringBackPatch(todo, id),
      })
      await recordActivity({
        entityType: 'TODO', todoId, sprintId: id,
        action: 'INITIATIVE_SPRINT_CHANGED',
        actorId: session.user.id,
        changes: { sprintId: { from: fromSprintId, to: id } },
        metadata: { reason: 'bring-back-after-reopen', sourceSprintId: id },
      })
    }
  })

  await recordActivity({
    entityType: 'SPRINT', sprintId: id, action: 'SPRINT_REOPENED',
    actorId: session.user.id,
    metadata: { bringBackTodoIds, windowDays: REOPEN_WINDOW_DAYS },
  })

  const recipients = Array.from(new Set([sprint.ownerId, ...sprint.participants.map(p => p.userId)]))
    .filter(uid => uid !== session.user.id)
  if (recipients.length > 0) {
    await emit('SPRINT_REOPENED', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: id,
      explicitRecipients: recipients,
      data: {
        actorName: session.user.name,
        sprintName: sprint.name,
        deepLink: `/dashboard/sprints/${id}`,
      },
    })
  }

  return apiSuccess({
    sprintId: id,
    state: 'ACTIVE',
    broughtBack: bringBackTodoIds,
    summary: sprint.completionSummary
      ? {
          completedCount: sprint.completionSummary.completedCount,
          incompleteCount: sprint.completionSummary.incompleteCount,
          movedToNext: sprint.completionSummary.movedToNext,
          movedToBacklog: sprint.completionSummary.movedToBacklog,
          cancelled: sprint.completionSummary.cancelledCount,
          nextSprintId: sprint.completionSummary.nextSprintId,
          dispositions,
        }
      : null,
  }, { message: 'Sprint reopened — tasks already dispositioned were not moved back automatically' })
})
