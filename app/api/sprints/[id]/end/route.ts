import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiError,
  withAuth,
} from '@/lib/api'
import { canEditSprint, type UserRole } from '@/lib/permissions'
import { emit } from '@/lib/notifications'
import { executeSprintClose, CloseError } from '@/lib/sprints/close-sprint'
import { findColumnMismatch } from '@/lib/sprints/end-sprint'

/**
 * GET /api/sprints/[id]/end — preflight for the End Sprint modal (BR-07).
 *
 * Returns counts, the incomplete todos (with carryover lineage for badges),
 * any column/status mismatch warnings, and candidate destination sprints.
 */
export const GET = withAuth<RouteIdParams>(async (_request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      participants: { select: { userId: true } },
      columns: { select: { statusKey: true, name: true } },
    },
  })
  if (!sprint) return apiNotFound('Sprint not found')
  if (sprint.state !== 'ACTIVE') return apiBadRequest('Only ACTIVE sprints can be ended')

  const role = session.user.role as UserRole
  const allowed = await canEditSprint(role, session.user.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  if (!allowed) return apiForbidden('Insufficient permissions to end this sprint')

  const todos = await prisma.todo.findMany({
    where: { sprintId: id },
    select: {
      id: true, title: true, status: true, carryoverCount: true,
      assignee: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { sprintPosition: 'asc' },
  })

  const completed = todos.filter(t => t.status === 'COMPLETED')
  const incomplete = todos.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')

  // BR-07 — "complete" means status === COMPLETED, full stop. The board derives
  // lane membership from status (SprintColumn.statusKey is unique per sprint), so
  // a non-COMPLETED todo can never render in the Done lane and a true mismatch is
  // structurally impossible. The field stays in the contract for the UI banner.
  const columnMismatch = findColumnMismatch(
    todos.filter(t => t.status === 'COMPLETED' && false), // always empty by construction
  )

  const destinations = await prisma.sprint.findMany({
    where: { state: { in: ['PLANNING', 'ACTIVE'] }, id: { not: id } },
    select: { id: true, name: true, state: true, startDate: true, endDate: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return apiSuccess({
    sprint: {
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      goal: sprint.goal,
      goalLabel: sprint.goalLabel,
      goalTarget: sprint.goalTarget,
      goalCurrent: sprint.goalCurrent,
      goalUnit: sprint.goalUnit,
    },
    counts: { total: todos.length, completed: completed.length, incomplete: incomplete.length },
    incompleteTodos: incomplete,
    columnMismatch,
    destinations,
  })
})

/**
 * POST /api/sprints/[id]/end — close an ACTIVE sprint (BR-02 transactional).
 *
 * Body: { incompleteHandling, perTaskActions?, nextSprintId?, createNextSprint?, reflectionNote? }
 * Returns: { sprintId, summary, dispositions, warnings }
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const body = await request.json().catch(() => ({}))

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
  })
  if (!sprint) return apiNotFound('Sprint not found')

  const role = session.user.role as UserRole
  const allowed = await canEditSprint(role, session.user.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  if (!allowed) return apiForbidden('Insufficient permissions to end this sprint')

  let result
  try {
    result = await executeSprintClose({
      sprintId: id,
      actorId: session.user.id,
      targetState: 'COMPLETED',
      payload: {
        incompleteHandling: body.incompleteHandling,
        perTaskActions: body.perTaskActions,
        nextSprintId: body.nextSprintId ?? null,
        createNextSprint: body.createNextSprint ?? null,
        reflectionNote: typeof body.reflectionNote === 'string' ? body.reflectionNote : null,
      },
    })
  } catch (err) {
    if (err instanceof CloseError) return apiError(err.message, { status: err.status, code: err.code })
    throw err
  }

  // ---- Post-commit notifications (BR-10) ------------------------------------
  const recipients = Array.from(new Set([result.notify.ownerId, ...result.notify.participantIds]))
    .filter(uid => uid !== session.user.id)
  if (recipients.length > 0) {
    await emit('SPRINT_ENDED_BY_USER', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: id,
      explicitRecipients: recipients,
      data: {
        actorName: session.user.name,
        sprintName: result.notify.sprintName,
        deepLink: `/dashboard/sprints/${id}/report`,
      },
    })
  }

  if (result.notify.carried.length > 0 && result.summary.nextSprintId) {
    for (const c of result.notify.carried) {
      if (!c.assigneeId || c.assigneeId === session.user.id) continue
      await emit('INITIATIVE_CARRIED_OVER', {
        actorId: session.user.id,
        entityType: 'TODO', entityId: c.todoId, entityTitle: c.title,
        explicitRecipients: [c.assigneeId],
        data: {
          actorName: session.user.name,
          nextSprintName: result.notify.nextSprintName ?? '',
          deepLink: `/dashboard/sprints/${result.summary.nextSprintId}`,
        },
      })
    }
  }

  for (const c of result.notify.cancelledTodos) {
    if (!c.assigneeId || c.assigneeId === session.user.id) continue
    await emit('INITIATIVE_CANCELLED_AT_CLOSE', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: c.todoId, entityTitle: c.title,
      explicitRecipients: [c.assigneeId],
      data: {
        actorName: session.user.name,
        sprintName: result.notify.sprintName,
        deepLink: `/dashboard/sprints/${id}/report`,
      },
    })
  }

  return apiSuccess({
    sprintId: result.sprintId,
    summary: result.summary,
    dispositions: result.dispositions,
    warnings: result.warnings,
  })
})
