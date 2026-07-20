import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { recalcNodeAndAncestors } from '@/lib/objectiveProgress'
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
    return apiForbidden('Insufficient permissions to clone objectives')
  }

  const { id: objectiveId } = await resolveParams(params)
  if (!objectiveId) return apiBadRequest('Invalid objective id')

  const { title, timeframeId, includeKeyResults, includeIncompleteTodos, keyResultOverrides } = await request.json()

  if (!title || !timeframeId) {
    return apiBadRequest('Title and timeframe are required')
  }

  const originalObjective = await prisma.objective.findUnique({
    where: { id: objectiveId },
    include: {
      keyResults: {
        where: { status: 'ACTIVE' },
        include: { todos: { where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } } },
      },
      todos: { where: { keyResultId: null, status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
      rolledTo: { select: { id: true, title: true }, take: 1 },
      owner: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
  })

  if (!originalObjective) return apiNotFound('Original objective not found')
  if (originalObjective.rolledTo.length > 0) {
    return apiConflict('This Objective has already been rolled forward. Open its successor instead.')
  }

  const timeframe = await prisma.timeframe.findUnique({ where: { id: timeframeId } })
  if (!timeframe) return apiBadRequest('Invalid timeframe')

  const existingObjective = await prisma.objective.findFirst({
    where: { title, timeframeId, status: 'ACTIVE' },
  })
  if (existingObjective) {
    return apiConflict('An objective with this title already exists in the selected timeframe')
  }

  if (includeKeyResults) {
    for (const kr of originalObjective.keyResults) {
      const override = keyResultOverrides?.[kr.id] || {}
      const carriedStartValue = kr.finalValue ?? kr.currentValue
      const startValue = override.useCarriedBaseline === false ? Number(override.startValue ?? kr.startValue) : carriedStartValue
      const targetValue = Number(override.targetValue ?? kr.targetValue)
      if (!Number.isFinite(startValue) || !Number.isFinite(targetValue) || targetValue <= startValue) {
        return apiBadRequest(`Target must be greater than the carried start for “${kr.title}”`)
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const clonedObjective = await tx.objective.create({
      data: {
        title,
        description: originalObjective.description,
        level: originalObjective.level,
        ownerId: originalObjective.ownerId,
        timeframeId,
        departmentId: originalObjective.departmentId,
        status: 'ACTIVE',
        goalStatus: 'ON_TRACK',
        progress: 0,
        confidence: 50,
        checkInCadence: originalObjective.checkInCadence,
        alignmentType: originalObjective.alignmentType,
        rollupCalculation: originalObjective.rollupCalculation,
        rolledFromId: originalObjective.id,
        lineageRootId: originalObjective.lineageRootId || originalObjective.id,
        lineageDepth: originalObjective.lineageDepth + 1,
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        timeframe: true,
        department: { select: { id: true, name: true } },
      },
    })

    if (includeKeyResults && originalObjective.keyResults.length > 0) {
      for (const kr of originalObjective.keyResults) {
        const override = keyResultOverrides?.[kr.id] || {}
        const carriedStartValue = kr.finalValue ?? kr.currentValue
        const startValue = override.useCarriedBaseline === false
          ? Number(override.startValue ?? kr.startValue)
          : carriedStartValue
        const targetValue = Number(override.targetValue ?? kr.targetValue)
        const clonedKeyResult = await tx.keyResult.create({
          data: {
            title: kr.title,
            description: kr.description,
            startValue,
            carriedStartValue,
            targetValue,
            currentValue: startValue,
            progress: 0,
            confidence: 'ON_TRACK',
            unit: kr.unit,
            objectiveId: clonedObjective.id,
            ownerId: kr.ownerId,
            status: 'ACTIVE',
            checkInCadence: kr.checkInCadence,
            rolledFromId: kr.id,
            lineageRootId: kr.lineageRootId || kr.id,
            lineageDepth: kr.lineageDepth + 1,
          },
        })
        if (includeIncompleteTodos && kr.todos.length > 0) {
          await tx.todo.createMany({
            data: kr.todos.map((todo) => ({
              title: todo.title, description: todo.description, status: 'PENDING', priority: todo.priority,
              startDate: null, dueDate: null, assigneeId: todo.assigneeId, creatorId: session.user.id,
              keyResultId: clonedKeyResult.id, objectiveId: clonedObjective.id, progressValue: todo.progressValue,
              taskType: todo.taskType,
            })),
          })
        }
      }
    }

    if (includeIncompleteTodos && originalObjective.todos.length > 0) {
      await tx.todo.createMany({
        data: originalObjective.todos.map((todo) => ({
          title: todo.title, description: todo.description, status: 'PENDING', priority: todo.priority,
          startDate: null, dueDate: null, assigneeId: todo.assigneeId, creatorId: session.user.id,
          objectiveId: clonedObjective.id, progressValue: todo.progressValue, taskType: todo.taskType,
        })),
      })
    }

    await recalcNodeAndAncestors(tx, clonedObjective.id)

    return clonedObjective
  })

  const completeClonedObjective = await prisma.objective.findUnique({
    where: { id: result.id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: true,
      department: { select: { id: true, name: true } },
      keyResults: {
        include: { owner: { select: { id: true, name: true, avatar: true } } },
      },
      _count: { select: { keyResults: true, childObjectives: true } },
    },
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: result.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { clonedFromId: objectiveId, source: 'clone' },
  })
  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId,
    action: 'ROLLED_FORWARD',
    actorId: session.user.id,
    metadata: { rolledToId: result.id, timeframeId, includeKeyResults: Boolean(includeKeyResults) },
  })

  return apiSuccess(completeClonedObjective, {
    status: 201,
    message: 'Objective cloned successfully.',
  })
})
