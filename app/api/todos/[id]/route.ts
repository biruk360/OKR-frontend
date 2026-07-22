import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, type UserRole } from '@/lib/permissions'
import { resolveDocTypePermission } from '@/lib/permission-resolver'
import { buildScopeFilter } from '@/lib/apply-scope'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import { emit, resolveTodoStakeholders } from '@/lib/notifications'
import { broadcastSprintEvent } from '@/lib/pusher'
import { recalcKrFromInitiatives, recalcNodeAndAncestors } from '@/lib/objectiveProgress'
import { hasTodoParticipantWriteAccess } from '@/lib/todos/access'
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
    title, description, status, startDate, dueDate, startTime, endTime, completedAt, progressValue,
    assigneeId, priority, coverColor,
    sprintId, taskType,
    sprintPosition, // number — card position within its sprint+status lane
    sortOrder,      // number — card position within its status column on the global todo kanban
    memberIds,   // string[] — full replacement of members list
    labelIds,    // string[] (TodoLabelDef ids) — full replacement
    keyResultId, // string | null — link/unlink to a Key Result. Recalculates KR currentValue on change.
    objectiveId, // string | null — link/unlink to an Objective directly (work that spans the whole O).
  } = await request.json()

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
  if (startTime !== undefined && startTime !== null && !TIME_RE.test(String(startTime))) {
    return apiBadRequest('Invalid startTime (expected HH:mm)')
  }
  if (endTime !== undefined && endTime !== null && !TIME_RE.test(String(endTime))) {
    return apiBadRequest('Invalid endTime (expected HH:mm)')
  }

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

  // Permission: creators, assignees, and explicit task members can always edit.
  // KR/objective managers can also edit linked todos.
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
  const intrinsicHasAccess = hasTodoParticipantWriteAccess(session.user.id, {
    assigneeId: existingTodo.assigneeId,
    creatorId: existingTodo.creatorId,
    memberIds: existingTodo.members.map((member) => member.userId),
  })
  const legacyHasAccess =
    intrinsicHasAccess ||
    canManageKr ||
    (['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'] as string[]).includes(session.user.role)

  let hasAccess = legacyHasAccess
  try {
    let rbacHasAccess = await resolveDocTypePermission(session.user.id, 'todo', 'write')
    if (rbacHasAccess) {
      const scopeFilter = await buildScopeFilter(session.user.id, 'todo', 'write')
      if (scopeFilter) {
        const scopedTodo = await prisma.todo.findFirst({
          where: { id: todoId, AND: [scopeFilter] },
          select: { id: true },
        })
        rbacHasAccess = scopedTodo !== null
      }
    }
    // DB permissions can expand access, but must not revoke participant access.
    hasAccess = legacyHasAccess || rbacHasAccess
  } catch {
    // Keep legacy access only while a deployment is still applying RBAC tables.
  }

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

  // Validate KR link change. Setting keyResultId clears any stale objectiveId
  // ambiguity (the KR's objective is the canonical parent in that case).
  let nextKrObjectiveId: string | null | undefined
  if (keyResultId !== undefined && keyResultId !== existingTodo.keyResultId) {
    if (keyResultId === null) {
      nextKrObjectiveId = null
    } else {
      const kr = await prisma.keyResult.findUnique({
        where: { id: keyResultId },
        select: { id: true, objectiveId: true },
      })
      if (!kr) return apiBadRequest('Key result not found')
      nextKrObjectiveId = kr.objectiveId
    }
  }
  if (objectiveId !== undefined && objectiveId !== null && objectiveId !== existingTodo.objectiveId) {
    const obj = await prisma.objective.findUnique({ where: { id: objectiveId }, select: { id: true } })
    if (!obj) return apiBadRequest('Objective not found')
  }

  const updatedTodo = await prisma.$transaction(async (tx) => {
    const updated = await tx.todo.update({
      where: { id: todoId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(startTime !== undefined && { startTime: startTime ?? null }),
        ...(endTime !== undefined && { endTime: endTime ?? null }),
        ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
        ...(parsedProgressValue !== undefined && { progressValue: parsedProgressValue }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(priority !== undefined && { priority }),
        ...(coverColor !== undefined && { coverColor }),
        ...(sprintId !== undefined && { sprintId: sprintId ?? null }),
        ...(taskType !== undefined && { taskType: taskType ?? null }),
        ...(typeof sprintPosition === 'number' && { sprintPosition }),
        ...(typeof sortOrder === 'number' && { sortOrder }),
        ...(keyResultId !== undefined && { keyResultId: keyResultId ?? null }),
        ...(objectiveId !== undefined && { objectiveId: objectiveId ?? null }),
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

    // KR link changed — recalc both the old and new KR (and their objective trees)
    // so completed-initiative aggregates stay accurate on both sides of the move.
    if (keyResultId !== undefined && keyResultId !== existingTodo.keyResultId) {
      if (existingTodo.keyResultId) {
        await recalcKrFromInitiatives(tx, existingTodo.keyResultId)
        if (existingTodo.keyResult?.objectiveId) {
          await recalcNodeAndAncestors(tx, existingTodo.keyResult.objectiveId)
        }
      }
      if (keyResultId) {
        await recalcKrFromInitiatives(tx, keyResultId)
        if (nextKrObjectiveId) await recalcNodeAndAncestors(tx, nextKrObjectiveId)
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

  if (sprintId !== undefined && sprintId !== (existingTodo as any).sprintId) {
    await recordActivity({
      entityType: 'TODO', todoId, sprintId: sprintId ?? null,
      action: 'INITIATIVE_SPRINT_CHANGED',
      actorId: session.user.id,
      changes: { sprintId: { from: (existingTodo as any).sprintId ?? null, to: sprintId ?? null } },
    })
  }
  if (taskType !== undefined && taskType !== (existingTodo as any).taskType) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'INITIATIVE_TASK_TYPE_CHANGED',
      actorId: session.user.id,
      changes: { taskType: { from: (existingTodo as any).taskType ?? null, to: taskType ?? null } },
    })
  }

  if (keyResultId !== undefined && keyResultId !== existingTodo.keyResultId) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'INITIATIVE_KR_LINK_CHANGED',
      actorId: session.user.id,
      changes: { keyResultId: { from: existingTodo.keyResultId ?? null, to: keyResultId ?? null } },
    })
  }
  if (objectiveId !== undefined && objectiveId !== existingTodo.objectiveId) {
    await recordActivity({
      entityType: 'TODO', todoId, action: 'INITIATIVE_OBJECTIVE_LINK_CHANGED',
      actorId: session.user.id,
      changes: { objectiveId: { from: existingTodo.objectiveId ?? null, to: objectiveId ?? null } },
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

  // Sprint v2: SPRINT_TASK_ASSIGNED on sprint reassignment
  const finalSprintId = sprintId !== undefined ? (sprintId ?? null) : (existingTodo as any).sprintId ?? null
  const finalAssigneeId = assigneeId ?? existingTodo.assigneeId
  if (sprintId !== undefined && sprintId && sprintId !== (existingTodo as any).sprintId && finalAssigneeId && finalAssigneeId !== session.user.id) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { name: true } })
    await emit('SPRINT_TASK_ASSIGNED', {
      actorId: session.user.id,
      entityType: 'TODO', entityId: todoId, entityTitle: updatedTodo.title,
      explicitRecipients: [finalAssigneeId],
      data: {
        actorName: session.user.name,
        sprintName: sprint?.name ?? '',
        deepLink: `/dashboard/sprints/${sprintId}`,
      },
    })
  }

  // Fan out a "card activity" notification to everyone who has interacted with
  // this todo (assignee, members, creator, commenters) whenever a meaningful
  // field changes. We piggy-back on COMMENT_ON_OWNED_ENTITY because it already
  // has IMMEDIATE/digest cadence wired and a template registered.
  const meaningful =
    dueDate !== undefined ||
    (Array.isArray(memberIds)) ||
    (Array.isArray(labelIds)) ||
    (title !== undefined && title !== existingTodo.title) ||
    (description !== undefined && description !== existingTodo.description) ||
    (priority !== undefined && priority !== existingTodo.priority) ||
    (assigneeId !== undefined && assigneeId !== existingTodo.assigneeId)
  if (meaningful) {
    const stakeholders = (await resolveTodoStakeholders(todoId)).filter((id) => id !== session.user.id)
    if (stakeholders.length > 0) {
      const changedFields: string[] = []
      if (dueDate !== undefined) changedFields.push('due date')
      if (Array.isArray(memberIds)) changedFields.push('members')
      if (Array.isArray(labelIds)) changedFields.push('labels')
      if (title !== undefined && title !== existingTodo.title) changedFields.push('title')
      if (description !== undefined && description !== existingTodo.description) changedFields.push('description')
      if (priority !== undefined && priority !== existingTodo.priority) changedFields.push('priority')
      if (assigneeId !== undefined && assigneeId !== existingTodo.assigneeId) changedFields.push('assignee')
      await emit('COMMENT_ON_OWNED_ENTITY', {
        actorId: session.user.id,
        entityType: 'TODO', entityId: todoId, entityTitle: updatedTodo.title,
        explicitRecipients: stakeholders,
        data: {
          actorName: session.user.name,
          summary: `Updated ${changedFields.join(', ')}`,
          deepLink: `/dashboard/todos?open=${todoId}`,
        },
      })
    }
  }

  // Sprint v2 realtime broadcasts
  if (finalSprintId) {
    if (status !== undefined && status !== existingTodo.status) {
      await broadcastSprintEvent(finalSprintId, 'task:moved', {
        todoId,
        fromStatus: existingTodo.status,
        toStatus: status,
        actorId: session.user.id,
      })
    }
    const broadcastChanges: Record<string, unknown> = {}
    if (assigneeId !== undefined && assigneeId !== existingTodo.assigneeId) broadcastChanges.assigneeId = assigneeId
    if (dueDate !== undefined) broadcastChanges.dueDate = dueDate ?? null
    if (priority !== undefined && priority !== existingTodo.priority) broadcastChanges.priority = priority
    if (title !== undefined && title !== existingTodo.title) broadcastChanges.title = title
    if (Object.keys(broadcastChanges).length > 0) {
      await broadcastSprintEvent(finalSprintId, 'task:updated', {
        todoId,
        changes: broadcastChanges,
        actorId: session.user.id,
      })
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
