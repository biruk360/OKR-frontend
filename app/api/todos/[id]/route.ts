import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, type UserRole } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { recalcKrFromInitiatives, recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const { title, description, status, dueDate, completedAt, progressValue } = await request.json()

  const existingTodo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: {
      keyResult: {
        include: {
          objective: {
            include: {
              owner: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })

  if (!existingTodo) return apiNotFound('To-do not found')

  // Permission: creator/assignee can always edit. KR/objective managers can also edit linked todos.
  const kr = existingTodo.keyResult
  let canManageKr = false
  if (kr) {
    canManageKr = await canEditKeyResultWithObjectiveContext(
      session.user.role as UserRole,
      session.user.id,
      { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
      {
        level: kr.objective.level,
        ownerId: kr.objective.ownerId,
        departmentId: kr.objective.departmentId,
      }
    )
  }
  const hasAccess =
    session.user.id === existingTodo.assigneeId ||
    session.user.id === existingTodo.creatorId ||
    canManageKr ||
    session.user.role === 'ADMIN'

  if (!hasAccess) {
    return apiForbidden('Insufficient permissions to update this to-do')
  }

  // Parse progressValue — accept number or numeric string. Null explicitly clears it.
  let parsedProgressValue: number | null | undefined
  if (progressValue === null) {
    parsedProgressValue = null
  } else if (progressValue !== undefined) {
    const n = typeof progressValue === 'number' ? progressValue : parseFloat(progressValue)
    if (!Number.isFinite(n) || n < 0) {
      return apiBadRequest('progressValue must be a non-negative number')
    }
    parsedProgressValue = n
  }

  const updatedTodo = await prisma.$transaction(async (tx) => {
    const updated = await tx.todo.update({
      where: { id: todoId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
        ...(parsedProgressValue !== undefined && { progressValue: parsedProgressValue }),
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        creator: { select: { id: true, name: true, avatar: true } },
      },
    })

    // If this initiative is linked to a KR and either its status or its progressValue
    // changed, re-aggregate the KR's currentValue from its completed initiatives,
    // then cascade progress up the objective tree.
    const krId = existingTodo.keyResultId
    const statusChanged = status !== undefined && status !== existingTodo.status
    const valueChanged = parsedProgressValue !== undefined && parsedProgressValue !== existingTodo.progressValue
    if (krId && (statusChanged || valueChanged)) {
      await recalcKrFromInitiatives(tx, krId)
      if (existingTodo.keyResult?.objectiveId) {
        await recalcNodeAndAncestors(tx, existingTodo.keyResult.objectiveId)
      }
    }

    return updated
  })

  const initiativeChanges: Record<string, { from: unknown; to: unknown }> = {}
  if (title !== undefined && title !== existingTodo.title) initiativeChanges.title = { from: existingTodo.title, to: title }
  if (description !== undefined && description !== existingTodo.description) initiativeChanges.description = { from: existingTodo.description, to: description }
  if (status !== undefined && status !== existingTodo.status) initiativeChanges.status = { from: existingTodo.status, to: status }
  if (parsedProgressValue !== undefined && parsedProgressValue !== existingTodo.progressValue) {
    initiativeChanges.progressValue = { from: existingTodo.progressValue, to: parsedProgressValue }
  }

  if (Object.keys(initiativeChanges).length > 0 && existingTodo.keyResult) {
    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId: existingTodo.keyResultId,
      objectiveId: existingTodo.keyResult.objectiveId,
      action: 'INITIATIVE_UPDATED',
      actorId: session.user.id,
      changes: initiativeChanges,
      metadata: { initiativeId: todoId, title: updatedTodo.title },
    })
  }

  return apiSuccess(updatedTodo, { message: 'Initiative updated successfully' })
})

export const DELETE = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const existingTodo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: {
      keyResult: {
        include: {
          objective: {
            include: {
              owner: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })

  if (!existingTodo) return apiNotFound('To-do not found')

  const kr = existingTodo.keyResult
  let canManageKr = false
  if (kr) {
    canManageKr = await canEditKeyResultWithObjectiveContext(
      session.user.role as UserRole,
      session.user.id,
      { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
      {
        level: kr.objective.level,
        ownerId: kr.objective.ownerId,
        departmentId: kr.objective.departmentId,
      }
    )
  }
  const hasAccess =
    session.user.id === existingTodo.creatorId ||
    canManageKr ||
    session.user.role === 'ADMIN'

  if (!hasAccess) {
    return apiForbidden('Insufficient permissions to delete this to-do')
  }

  await prisma.todo.delete({ where: { id: todoId } })

  if (existingTodo.keyResult) {
    await recordActivity({
      entityType: 'KEY_RESULT',
      keyResultId: existingTodo.keyResultId,
      objectiveId: existingTodo.keyResult.objectiveId,
      action: 'INITIATIVE_REMOVED',
      actorId: session.user.id,
      metadata: { initiativeId: todoId, title: existingTodo.title },
    })
  }

  return apiSuccess(null, { message: 'Initiative deleted successfully' })
})
