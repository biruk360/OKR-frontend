import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, canViewObjective, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { broadcastSprintEvent } from '@/lib/pusher'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  withAuth,
} from '@/lib/api'

/**
 * GET /api/todos — list todos visible to the current user.
 *
 * Scopes:
 *   - ?mine=assigned  → assigned to me (default for /dashboard/todos)
 *   - ?mine=created   → created by me
 *   - ?mine=all       → assigned OR created by me (broadest personal view)
 *
 * Optional filters:
 *   - ?status=PENDING|IN_PROGRESS|COMPLETED|CANCELLED
 *   - ?keyResultId=<id>
 *   - ?objectiveId=<id>
 *   - ?q=<text>  → case-insensitive title substring
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const mine = (searchParams.get('mine') || 'all').toLowerCase()
  const status = searchParams.get('status')
  const keyResultId = searchParams.get('keyResultId')
  const objectiveId = searchParams.get('objectiveId')
  const sprintId = searchParams.get('sprintId')
  const noSprint = searchParams.get('noSprint')
  const taskType = searchParams.get('taskType')
  const q = searchParams.get('q')?.trim()

  const where: any = {}

  if (mine === 'assigned') {
    where.assigneeId = session.user.id
  } else if (mine === 'created') {
    where.creatorId = session.user.id
  } else {
    where.OR = [{ assigneeId: session.user.id }, { creatorId: session.user.id }]
  }

  if (status) where.status = status
  if (sprintId) where.sprintId = sprintId
  if (noSprint === '1' || noSprint === 'true') where.sprintId = null
  if (taskType) where.taskType = taskType
  if (keyResultId) where.keyResultId = keyResultId
  if (objectiveId) {
    where.AND = [
      {
        OR: [{ objectiveId }, { keyResult: { objectiveId } }],
      },
    ]
  }
  if (q) {
    where.AND = [...(where.AND || []), { title: { contains: q, mode: 'insensitive' as const } }]
  }

  const todos = await prisma.todo.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      keyResult: {
        select: {
          id: true,
          title: true,
          objective: { select: { id: true, title: true, level: true } },
        },
      },
      objective: { select: { id: true, title: true, level: true } },
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
    take: 500,
  })

  return apiSuccess(todos)
})

/**
 * POST /api/todos — create a todo.
 *
 * Rules:
 *   - `title` required; everything else optional.
 *   - `assigneeId` defaults to the caller.
 *   - When linked to a KR, the caller must have edit rights on that KR.
 *   - When linked to an objective only, the caller must at least view it.
 *   - Standalone todos (no link) are always allowed.
 *
 * Side effects:
 *   - If linked to a KR, the creation is recorded on the KR activity log.
 */
export const POST = withAuth(async (request: NextRequest, { session }) => {
  let body: any
  try {
    body = await request.json()
  } catch {
    return apiBadRequest('Invalid JSON body')
  }

  const title = (body.title || '').trim()
  if (!title) return apiBadRequest('Title is required')

  const description = typeof body.description === 'string' ? body.description.trim() || null : null
  const dueDate = body.dueDate ? new Date(body.dueDate) : null

  let progressValue: number | null = null
  if (body.progressValue !== undefined && body.progressValue !== null) {
    const n = typeof body.progressValue === 'number' ? body.progressValue : parseFloat(body.progressValue)
    if (!Number.isFinite(n) || n < 0) {
      return apiBadRequest('progressValue must be a non-negative number')
    }
    progressValue = n
  }
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return apiBadRequest('Invalid dueDate')
  }

  // Trello-style: a todo can be created without a primary assignee. Members are
  // added later via the card's Members popover. We still accept an explicit
  // assigneeId for callers that want it (e.g. assigning to a teammate during
  // creation), but never default it to the current user.
  let assigneeId: string | null = null
  if (typeof body.assigneeId === 'string' && body.assigneeId.trim()) {
    const assignee = await prisma.user.findUnique({ where: { id: body.assigneeId }, select: { id: true } })
    if (!assignee) return apiBadRequest('Invalid assignee')
    assigneeId = assignee.id
  }

  let keyResultId: string | null = null
  if (body.keyResultId) {
    const kr = await prisma.keyResult.findUnique({
      where: { id: body.keyResultId },
      include: {
        objective: { select: { level: true, ownerId: true, departmentId: true } },
      },
    })
    if (!kr) return apiBadRequest('Invalid keyResultId')
    const allowed = await canEditKeyResultWithObjectiveContext(
      session.user.role as UserRole,
      session.user.id,
      { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
      kr.objective
    )
    if (!allowed) {
      return apiForbidden('Insufficient permissions to add a todo to this key result')
    }
    keyResultId = kr.id
  }

  let objectiveId: string | null = null
  if (body.objectiveId) {
    const obj = await prisma.objective.findUnique({
      where: { id: body.objectiveId },
      select: { id: true, level: true, ownerId: true, departmentId: true, isPrivate: true },
    })
    if (!obj) return apiBadRequest('Invalid objectiveId')
    if (!keyResultId) {
      const { canView } = await canViewObjective(session.user.role as UserRole, session.user.id, obj)
      if (!canView) {
        return apiForbidden('Insufficient permissions to view this objective')
      }
    }
    objectiveId = obj.id
  }

  const sprintId: string | null = typeof body.sprintId === 'string' ? body.sprintId : null
  const taskType: string | null = typeof body.taskType === 'string' ? body.taskType : null

  const todo = await prisma.todo.create({
    data: {
      title,
      description,
      dueDate,
      status: 'PENDING',
      assigneeId,
      creatorId: session.user.id,
      keyResultId,
      objectiveId,
      progressValue,
      sprintId,
      taskType,
    },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
      keyResult: {
        select: {
          id: true,
          title: true,
          objective: { select: { id: true, title: true, level: true } },
        },
      },
      objective: { select: { id: true, title: true, level: true } },
    },
  })

  if (keyResultId) {
    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId,
      objectiveId: todo.keyResult?.objective.id ?? null,
      action: 'INITIATIVE_ADDED',
      actorId: session.user.id,
      metadata: { initiativeId: todo.id, title: todo.title, assigneeId },
    })
  }

  await recordActivity({
    entityType: 'TODO', todoId: todo.id, action: 'INITIATIVE_CREATED',
    actorId: session.user.id,
    metadata: { title: todo.title, assigneeId: todo.assigneeId },
  })

  if (todo.assigneeId && todo.assigneeId !== session.user.id) {
    await emit('TODO_ASSIGNED', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: todo.id, entityTitle: todo.title,
      data: {
        actorName: session.user.name,
        dueDate: todo.dueDate ? todo.dueDate.toISOString().slice(0, 10) : null,
        deepLink: `/dashboard/todos`,
      },
    })
    if (todo.sprintId) {
      const sprint = await prisma.sprint.findUnique({ where: { id: todo.sprintId }, select: { name: true } })
      await emit('SPRINT_TASK_ASSIGNED', {
        actorId: session.user.id,
        entityType: 'TODO', entityId: todo.id, entityTitle: todo.title,
        explicitRecipients: [todo.assigneeId],
        data: {
          actorName: session.user.name,
          sprintName: sprint?.name ?? '',
          deepLink: `/dashboard/sprints/${todo.sprintId}`,
        },
      })
    }
  }

  if (todo.sprintId) {
    await broadcastSprintEvent(todo.sprintId, 'task:created', {
      todo,
      actorId: session.user.id,
    })
  }

  return apiSuccess(todo, { status: 201 })
})
