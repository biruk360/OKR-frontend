import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
  type UserRole,
} from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const keyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: { include: { owner: { select: { id: true, name: true } } } },
    },
  })

  if (!keyResult) return apiNotFound('Key result not found')

  const view = await canViewKeyResult(session.user.role as UserRole, session.user.id, {
    ownerId: keyResult.ownerId,
    objectiveId: keyResult.objectiveId,
    isPrivate: keyResult.isPrivate,
  })

  if (!view.canView) return apiForbidden('Insufficient permissions to view this key result')

  const todos = await prisma.todo.findMany({
    where: { keyResultId },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return apiSuccess(todos)
})

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const { title, description, assigneeId, progressValue } = await request.json()

  if (!title) {
    return apiBadRequest('Title is required')
  }

  // creatorId always comes from the session — never trusted from the client.
  const creatorId = session.user.id

  let parsedProgressValue: number | null = null
  if (progressValue !== undefined && progressValue !== null) {
    const n = typeof progressValue === 'number' ? progressValue : parseFloat(progressValue)
    if (!Number.isFinite(n) || n < 0) {
      return apiBadRequest('progressValue must be a non-negative number')
    }
    parsedProgressValue = n
  }

  const keyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: { objective: { include: { owner: { select: { id: true, name: true } } } } },
  })

  if (!keyResult) return apiNotFound('Key result not found')

  const canAdd = await canEditKeyResultWithObjectiveContext(
    session.user.role as UserRole,
    session.user.id,
    { ownerId: keyResult.ownerId, objectiveId: keyResult.objectiveId },
    {
      level: keyResult.objective.level,
      ownerId: keyResult.objective.ownerId,
      departmentId: keyResult.objective.departmentId,
    }
  )

  if (!canAdd) return apiForbidden('Insufficient permissions to add todos to this key result')

  if (assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId } })
    if (!assignee) return apiBadRequest('Invalid assignee')
  }

  const todo = await prisma.todo.create({
    data: {
      title,
      description: description || '',
      assigneeId: assigneeId || null,
      creatorId,
      keyResultId,
      status: 'PENDING',
      progressValue: parsedProgressValue,
    },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      creator: { select: { id: true, name: true, avatar: true } },
    },
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId,
    objectiveId: keyResult.objectiveId,
    action: 'INITIATIVE_ADDED',
    actorId: session.user.id,
    metadata: { initiativeId: todo.id, title: todo.title, assigneeId },
  })

  return apiSuccess(todo, { status: 201, message: 'Initiative created successfully' })
})
