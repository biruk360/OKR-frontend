import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseStartAndTarget } from '@/lib/keyResultNumbers'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { recordActivity } from '@/lib/activity-log'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiConflict,
  withAuth,
} from '@/lib/api'

export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  if (!['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'].includes(session.user.role)) {
    return apiForbidden('Insufficient permissions to clone key results')
  }

  const { id: keyResultId } = await resolveParams(params)
  if (!keyResultId) return apiBadRequest('Invalid key result id')

  const { title, description, ownerId, startValue, targetValue, unit, objectiveId, useCarriedBaseline = true, includeIncompleteTodos } = await request.json()

  if (!title || !ownerId || targetValue === undefined || targetValue === null || targetValue === '' || !objectiveId) {
    return apiBadRequest('Title, owner, target value, and objective are required')
  }

  const originalKeyResult = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    include: {
      objective: { include: { owner: { select: { id: true, name: true } } } },
      owner: { select: { id: true, name: true } },
      todos: { where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
      rolledTo: { select: { id: true }, take: 1 },
    },
  })

  if (!originalKeyResult) return apiNotFound('Original key result not found')
  if (originalKeyResult.rolledTo.length > 0) {
    return apiConflict('This Key Result has already been rolled forward. Open its successor instead.')
  }

  const carriedStartValue = originalKeyResult.finalValue ?? originalKeyResult.currentValue
  const bounds = parseStartAndTarget(useCarriedBaseline ? carriedStartValue : startValue, targetValue)
  if (!bounds.ok) return apiBadRequest(bounds.message)

  const canClone =
    session.user.role === 'ADMIN' ||
    session.user.id === originalKeyResult.objective.ownerId

  if (!canClone) {
    return apiForbidden('Insufficient permissions to clone this key result')
  }

  const objective = await prisma.objective.findUnique({ where: { id: objectiveId } })
  if (!objective) return apiNotFound('Objective not found')

  const owner = await prisma.user.findUnique({ where: { id: ownerId } })
  if (!owner) return apiBadRequest('Invalid owner')

  const existingKeyResult = await prisma.keyResult.findFirst({
    where: { title, objectiveId, status: 'ACTIVE' },
  })
  if (existingKeyResult) {
    return apiConflict('A key result with this title already exists in this objective')
  }

  const result = await prisma.$transaction(async (tx) => {
    const clonedKeyResult = await tx.keyResult.create({
      data: {
        title,
        description: description || '',
        ownerId,
        startValue: bounds.start,
        targetValue: bounds.target,
        currentValue: bounds.start,
        progress: 0,
        confidence: 'ON_TRACK',
        carriedStartValue,
        unit: unit || '%',
        objectiveId,
        status: 'ACTIVE',
        checkInCadence: originalKeyResult.checkInCadence,
        rolledFromId: originalKeyResult.id,
        lineageRootId: originalKeyResult.lineageRootId || originalKeyResult.id,
        lineageDepth: originalKeyResult.lineageDepth + 1,
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    if (includeIncompleteTodos && originalKeyResult.todos.length > 0) {
      await tx.todo.createMany({
        data: originalKeyResult.todos.map((todo) => ({
          title: todo.title, description: todo.description, status: 'PENDING', priority: todo.priority,
          startDate: null, dueDate: null, assigneeId: todo.assigneeId, creatorId: session.user.id,
          keyResultId: clonedKeyResult.id, objectiveId, progressValue: todo.progressValue, taskType: todo.taskType,
        })),
      })
    }

    await recalcNodeAndAncestors(tx, objectiveId)
    return clonedKeyResult
  })

  await recordActivity({
    entityType: 'KEY_RESULT',
    keyResultId: result.id,
    objectiveId: result.objectiveId,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { clonedFromId: keyResultId, source: 'clone' },
  })
  await recordActivity({
    entityType: 'KEY_RESULT', keyResultId, objectiveId: originalKeyResult.objectiveId,
    action: 'ROLLED_FORWARD', actorId: session.user.id,
    metadata: { rolledToId: result.id, targetObjectiveId: objectiveId, carriedStartValue },
  })

  return apiSuccess(result, { status: 201, message: 'Key Result cloned successfully.' })
})
