import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, canViewObjective, type UserRole } from '@/lib/permissions'
import { recordActivity } from '@/lib/activity-log'
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
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return apiBadRequest('Invalid dueDate')
  }

  const assigneeId: string = body.assigneeId || session.user.id
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } })
  if (!assignee) return apiBadRequest('Invalid assignee')

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

  return apiSuccess(todo, { status: 201 })
})
