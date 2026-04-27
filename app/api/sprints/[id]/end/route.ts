import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { canEditSprint, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'

/**
 * POST /api/sprints/[id]/end — End an ACTIVE sprint, deciding what happens to incomplete todos.
 *
 * Body:
 *   {
 *     incompleteHandling: 'next' | 'backlog' | 'cancel' | 'per-task',
 *     perTaskActions?: { todoId: string, action: 'next' | 'backlog' | 'cancel' }[],
 *     nextSprintId?: string,
 *     reflectionNote?: string
 *   }
 *
 * Returns: `{ completedCount, incompleteCount, movedToNext, movedToBacklog, cancelled }`
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const body = await request.json().catch(() => ({}))
  const handling = body.incompleteHandling as 'next' | 'backlog' | 'cancel' | 'per-task' | undefined
  if (!handling || !['next', 'backlog', 'cancel', 'per-task'].includes(handling)) {
    return apiBadRequest('incompleteHandling is required')
  }
  const perTaskActions: { todoId: string; action: 'next' | 'backlog' | 'cancel' }[] =
    Array.isArray(body.perTaskActions) ? body.perTaskActions : []
  const nextSprintId = typeof body.nextSprintId === 'string' ? body.nextSprintId : null
  const reflectionNote = typeof body.reflectionNote === 'string' ? body.reflectionNote : null

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: { participants: { select: { userId: true } } },
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

  // Validate nextSprintId if needed.
  const needsNext = handling === 'next' || perTaskActions.some(a => a.action === 'next')
  if (needsNext) {
    if (!nextSprintId) return apiBadRequest('nextSprintId is required when moving incomplete todos to a new sprint')
    const next = await prisma.sprint.findUnique({ where: { id: nextSprintId }, select: { id: true, state: true } })
    if (!next) return apiBadRequest('Invalid nextSprintId')
    if (next.state !== 'PLANNING' && next.state !== 'ACTIVE') {
      return apiBadRequest('nextSprintId must be a PLANNING or ACTIVE sprint')
    }
  }

  const incompleteTodos = await prisma.todo.findMany({
    where: { sprintId: id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: { id: true, title: true, status: true, assigneeId: true },
  })
  const completedCount = await prisma.todo.count({
    where: { sprintId: id, status: 'COMPLETED' },
  })

  const perTaskMap = new Map(perTaskActions.map(a => [a.todoId, a.action]))
  let movedToNext = 0, movedToBacklog = 0, cancelled = 0
  const carriedOver: { todoId: string; assigneeId: string | null; title: string }[] = []

  for (const todo of incompleteTodos) {
    const action: 'next' | 'backlog' | 'cancel' =
      handling === 'per-task'
        ? (perTaskMap.get(todo.id) ?? 'backlog')
        : handling
    let updateData: any
    let toSprintId: string | null
    if (action === 'next') {
      updateData = { sprintId: nextSprintId }
      toSprintId = nextSprintId
      movedToNext++
      carriedOver.push({ todoId: todo.id, assigneeId: todo.assigneeId, title: todo.title })
    } else if (action === 'cancel') {
      updateData = { status: 'CANCELLED' }
      toSprintId = null
      cancelled++
    } else {
      updateData = { sprintId: null }
      toSprintId = null
      movedToBacklog++
    }
    await prisma.todo.update({ where: { id: todo.id }, data: updateData })
    await recordActivity({
      entityType: 'TODO', todoId: todo.id, sprintId: id,
      action: 'INITIATIVE_SPRINT_CHANGED',
      actorId: session.user.id,
      changes: { sprintId: { from: id, to: toSprintId } },
      metadata: { reason: action, sourceSprintId: id, nextSprintId: toSprintId },
    })
  }

  await prisma.sprint.update({
    where: { id },
    data: {
      state: 'COMPLETED',
      endedAt: new Date(),
      endedById: session.user.id,
      reflectionNote,
    },
  })

  await recordActivity({
    entityType: 'SPRINT', sprintId: id, action: 'SPRINT_ENDED',
    actorId: session.user.id,
    metadata: { completedCount, incompleteCount: incompleteTodos.length, movedToNext, movedToBacklog, cancelled, reflectionNote },
  })

  const participantIds = (sprint.participants ?? []).map(p => p.userId)
  const sprintRecipients = Array.from(new Set([sprint.ownerId, ...participantIds])).filter(uid => uid !== session.user.id)
  if (sprintRecipients.length > 0) {
    await emit('SPRINT_ENDED_BY_USER', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: id,
      explicitRecipients: sprintRecipients,
      data: {
        actorName: session.user.name,
        sprintName: sprint.name,
        deepLink: `/dashboard/sprints/${id}`,
      },
    })
  }

  if (carriedOver.length > 0 && nextSprintId) {
    const nextSprint = await prisma.sprint.findUnique({ where: { id: nextSprintId }, select: { name: true } })
    for (const c of carriedOver) {
      if (!c.assigneeId || c.assigneeId === session.user.id) continue
      await emit('INITIATIVE_CARRIED_OVER', {
        actorId: session.user.id,
        entityType: 'TODO', entityId: c.todoId, entityTitle: c.title,
        explicitRecipients: [c.assigneeId],
        data: {
          actorName: session.user.name,
          nextSprintName: nextSprint?.name ?? '',
          deepLink: `/dashboard/sprints/${nextSprintId}`,
        },
      })
    }
  }

  return apiSuccess({
    completedCount,
    incompleteCount: incompleteTodos.length,
    movedToNext,
    movedToBacklog,
    cancelled,
  })
})
