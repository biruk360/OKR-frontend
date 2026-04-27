import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, type UserRole } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { recalcKrFromInitiatives, recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

/**
 * GET /api/todos/[id] — single initiative/todo with relations matching the list endpoint shape.
 * Powers the global initiative detail modal opened from anywhere in the app.
 */
const TODO_INCLUDE = {
  assignee: { select: { id: true, name: true, avatar: true } },
  creator: { select: { id: true, name: true, avatar: true } },
  members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
  labels: { include: { labelDef: true } },
  checklists: {
    orderBy: { position: 'asc' as const },
    include: {
      items: {
        orderBy: { position: 'asc' as const },
        include: { assignee: { select: { id: true, name: true, avatar: true } } },
      },
    },
  },
  attachments: { include: { uploadedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' as const } },
  keyResult: {
    select: {
      id: true, title: true,
      objective: { select: { id: true, title: true, level: true, timeframe: { select: { name: true } } } },
    },
  },
  objective: { select: { id: true, title: true, level: true, timeframe: { select: { name: true } } } },
} as const

export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')
  const todo = await prisma.todo.findUnique({ where: { id: todoId }, include: TODO_INCLUDE })
  if (!todo) return apiNotFound('To-do not found')
  const shaped = {
    ...todo,
    keyResult: todo.keyResult ? {
      id: todo.keyResult.id,
      title: todo.keyResult.title,
      objective: {
        id: todo.keyResult.objective.id,
        title: todo.keyResult.objective.title,
        level: todo.keyResult.objective.level,
        timeframeName: todo.keyResult.objective.timeframe?.name ?? '',
      },
    } : null,
    objective: todo.objective ? {
      id: todo.objective.id,
      title: todo.objective.title,
      level: todo.objective.level,
      timeframeName: todo.objective.timeframe?.name ?? '',
    } : null,
  }
  return apiSuccess(shaped)
})

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id: todoId } = await resolveParams(params)
  if (!todoId) return apiBadRequest('Invalid todo id')

  const {
    title, description, status, dueDate, completedAt, progressValue,
    assigneeId, priority, coverColor,
    memberIds,   // string[] — full replacement of members list
    labelIds,    // string[] (TodoLabelDef ids) — full replacement
  } = await request.json()

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
      members: { select: { userId: true } },
      labels: { select: { labelDefId: true } },
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

  // Validate new assignee if provided
  if (assigneeId && assigneeId !== existingTodo.assigneeId) {
    const newAssignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } })
    if (!newAssignee) return apiBadRequest('Assignee user not found')
  }

  const updatedTodo = await prisma.$transaction(async (tx) => {
    const updated = await tx.todo.update({
      where: { id: todoId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
        ...(parsedProgressValue !== undefined && { progressValue: parsedProgressValue }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(priority !== undefined && { priority }),
        ...(coverColor !== undefined && { coverColor }),
        // Replace members list atomically
        ...(Array.isArray(memberIds) && {
          members: {
            deleteMany: {},
            create: memberIds.map((uid: string) => ({ userId: uid })),
          },
        }),
        // Replace labels list atomically
        ...(Array.isArray(labelIds) && {
          labels: {
            deleteMany: {},
            create: labelIds.map((lid: string) => ({ labelDefId: lid })),
          },
        }),
      },
      include: TODO_INCLUDE,
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

  if (status === 'COMPLETED' && existingTodo.status !== 'COMPLETED') {
    await emit('TODO_COMPLETED', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: todoId, entityTitle: updatedTodo.title,
      data: { actorName: session.user.name, deepLink: `/dashboard/todos` },
    })
  }

  if (assigneeId && assigneeId !== existingTodo.assigneeId && assigneeId !== session.user.id) {
    await emit('TODO_ASSIGNED', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: todoId, entityTitle: updatedTodo.title,
      explicitRecipients: [assigneeId],
      data: { actorName: session.user.name, deepLink: `/dashboard/todos?open=${todoId}` },
    })
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

  // Per-Todo activity log entries
  if (status !== undefined && status !== existingTodo.status) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'INITIATIVE_STATUS_CHANGED',
      actorId: session.user.id,
      changes: { status: { from: existingTodo.status, to: status } },
    })
  }
  if (assigneeId !== undefined && assigneeId !== existingTodo.assigneeId) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'INITIATIVE_ASSIGNEE_CHANGED',
      actorId: session.user.id,
      changes: { assigneeId: { from: existingTodo.assigneeId, to: assigneeId } },
    })
  }
  const todoLevelChanges: Record<string, { from: unknown; to: unknown }> = {}
  if (title !== undefined && title !== existingTodo.title) todoLevelChanges.title = { from: existingTodo.title, to: title }
  if (description !== undefined && description !== existingTodo.description) todoLevelChanges.description = { from: existingTodo.description, to: description }
  if (priority !== undefined && priority !== existingTodo.priority) todoLevelChanges.priority = { from: existingTodo.priority, to: priority }
  if (dueDate !== undefined) {
    const newDate = dueDate ? new Date(dueDate).toISOString() : null
    const oldDate = existingTodo.dueDate ? existingTodo.dueDate.toISOString() : null
    if (newDate !== oldDate) todoLevelChanges.dueDate = { from: oldDate, to: newDate }
  }
  if (coverColor !== undefined && coverColor !== existingTodo.coverColor) todoLevelChanges.coverColor = { from: existingTodo.coverColor, to: coverColor }
  if (Object.keys(todoLevelChanges).length > 0) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'UPDATED',
      actorId: session.user.id,
      changes: todoLevelChanges,
    })
  }

  if (Array.isArray(memberIds)) {
    const oldMemberIds = new Set((existingTodo as any).members?.map((m: { userId: string }) => m.userId) ?? [])
    const newSet = new Set<string>(memberIds)
    for (const uid of Array.from(newSet)) {
      if (!oldMemberIds.has(uid)) {
        await recordActivity({
          entityType: 'TODO', todoId, action: 'INITIATIVE_MEMBER_ADDED',
          actorId: session.user.id, metadata: { userId: uid },
        })
      }
    }
    for (const uid of Array.from(oldMemberIds)) {
      if (!newSet.has(uid as string)) {
        await recordActivity({
          entityType: 'TODO', todoId, action: 'INITIATIVE_MEMBER_REMOVED',
          actorId: session.user.id, metadata: { userId: uid },
        })
      }
    }
  }

  if (Array.isArray(labelIds)) {
    const oldSet = new Set((existingTodo as any).labels?.map((l: { labelDefId: string }) => l.labelDefId) ?? [])
    const newSet = new Set<string>(labelIds)
    for (const lid of Array.from(newSet)) {
      if (!oldSet.has(lid)) {
        await recordActivity({
          entityType: 'TODO', todoId, action: 'INITIATIVE_LABEL_ADDED',
          actorId: session.user.id, metadata: { labelDefId: lid },
        })
      }
    }
    for (const lid of Array.from(oldSet)) {
      if (!newSet.has(lid as string)) {
        await recordActivity({
          entityType: 'TODO', todoId, action: 'INITIATIVE_LABEL_REMOVED',
          actorId: session.user.id, metadata: { labelDefId: lid },
        })
      }
    }
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
