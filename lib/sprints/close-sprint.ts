/**
 * Transactional sprint close — wires the pure disposition engine
 * (lib/sprints/end-sprint.ts) into a single prisma transaction (BR-02).
 *
 * Used by:
 *  - POST /api/sprints/[id]/end            (targetState COMPLETED)
 *  - PATCH /api/sprints/[id] state=CANCELLED (targetState CANCELLED, BR-01)
 *
 * Notifications are emitted by the caller AFTER commit, never inside.
 */

import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import {
  computeDispositions,
  computeWarnings,
  buildCarryoverPatch,
  carriedPosition,
  backlogSortOrder,
  type Disposition,
  type DispositionAction,
  type IncompleteHandling,
  type IncompleteTodo,
} from './end-sprint'

export class CloseError extends Error {
  constructor(
    message: string,
    public status: number = 400,
    public code: string = 'BAD_REQUEST',
  ) {
    super(message)
  }
}

export interface CreateNextSprintInput {
  name: string
  startDate?: string | null
  endDate?: string | null
  goal?: string | null
}

export interface CloseSprintPayload {
  incompleteHandling: IncompleteHandling
  perTaskActions?: { todoId: string; action: DispositionAction }[]
  nextSprintId?: string | null
  createNextSprint?: CreateNextSprintInput | null
  reflectionNote?: string | null
}

export interface CloseSprintResult {
  sprintId: string
  targetState: 'COMPLETED' | 'CANCELLED'
  summary: {
    completedCount: number
    incompleteCount: number
    movedToNext: number
    movedToBacklog: number
    cancelled: number
    nextSprintId: string | null
  }
  dispositions: Disposition[]
  warnings: { todoId: string; code: 'CARRIED_3_PLUS' }[]
  /** Data the caller needs to emit post-commit notifications. */
  notify: {
    sprintName: string
    nextSprintName: string | null
    participantIds: string[]
    ownerId: string
    carried: { todoId: string; title: string; assigneeId: string | null }[]
    cancelledTodos: { todoId: string; title: string; assigneeId: string | null }[]
  }
}

const VALID_HANDLINGS: IncompleteHandling[] = ['next', 'backlog', 'cancel', 'per-task']

export async function executeSprintClose(args: {
  sprintId: string
  actorId: string
  payload: CloseSprintPayload
  targetState: 'COMPLETED' | 'CANCELLED'
}): Promise<CloseSprintResult> {
  const { sprintId, actorId, payload, targetState } = args
  const handling = payload.incompleteHandling
  if (!handling || !VALID_HANDLINGS.includes(handling)) {
    throw new CloseError('incompleteHandling is required (next | backlog | cancel | per-task)')
  }
  const perTaskActions = Array.isArray(payload.perTaskActions) ? payload.perTaskActions : []
  const createNext = payload.createNextSprint ?? null
  let nextSprintId = typeof payload.nextSprintId === 'string' ? payload.nextSprintId : null

  // ---- Pre-transaction validation ------------------------------------------
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { participants: { select: { userId: true } }, columns: true },
  })
  if (!sprint) throw new CloseError('Sprint not found', 404, 'NOT_FOUND')
  // COMPLETED closes require ACTIVE; CANCELLED may also come from PLANNING.
  const allowedSources = targetState === 'CANCELLED' ? ['ACTIVE', 'PLANNING'] : ['ACTIVE']
  if (!allowedSources.includes(sprint.state)) {
    throw new CloseError(`Only ${allowedSources.join('/')} sprints can be ended`, 409, 'SPRINT_NOT_ACTIVE')
  }

  if (nextSprintId && nextSprintId === sprintId) {
    throw new CloseError('nextSprintId cannot be the sprint being closed')
  }
  if (createNext) {
    if (typeof createNext.name !== 'string' || !createNext.name.trim()) {
      throw new CloseError('createNextSprint.name is required')
    }
    nextSprintId = null // resolved inside the transaction
  }

  const needsNext =
    handling === 'next' || perTaskActions.some(a => a.action === 'next')
  if (needsNext && !nextSprintId && !createNext) {
    throw new CloseError('nextSprintId or createNextSprint is required when moving incomplete todos to a next sprint')
  }
  if (nextSprintId) {
    const next = await prisma.sprint.findUnique({ where: { id: nextSprintId }, select: { id: true, state: true } })
    if (!next) throw new CloseError('Invalid nextSprintId')
    if (next.state !== 'PLANNING' && next.state !== 'ACTIVE') {
      throw new CloseError('nextSprintId must be a PLANNING or ACTIVE sprint')
    }
  }

  const incompleteTodos: IncompleteTodo[] = await prisma.todo.findMany({
    where: { sprintId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    select: {
      id: true, title: true, status: true, assigneeId: true,
      sprintPosition: true, carryoverCount: true, originalSprintId: true,
    },
    orderBy: { sprintPosition: 'asc' }, // BR-04: preserve relative board order
  })

  const knownIds = new Set(incompleteTodos.map(t => t.id))
  const unknown = perTaskActions.find(a => !knownIds.has(a.todoId))
  if (unknown) throw new CloseError(`perTaskActions references a todo not in this sprint: ${unknown.todoId}`)

  const dispositions = computeDispositions(incompleteTodos, handling, perTaskActions, nextSprintId)
  const warnings = computeWarnings(incompleteTodos, dispositions)

  // ---- Transaction ----------------------------------------------------------
  const now = new Date()
  const result = await prisma.$transaction(async (tx) => {
    // Re-check state inside the transaction (concurrent double-close, spec edge 9).
    const fresh = await tx.sprint.findUnique({ where: { id: sprintId }, select: { state: true } })
    if (!fresh || !allowedSources.includes(fresh.state)) {
      throw new CloseError('Sprint state changed concurrently — close aborted', 409, 'SPRINT_NOT_ACTIVE')
    }

    // Optionally create the destination sprint (Jira parity: "New sprint" option).
    let resolvedNextId = nextSprintId
    if (createNext) {
      const created = await tx.sprint.create({
        data: {
          name: createNext.name.trim(),
          ownerId: actorId,
          status: 'ACTIVE',
          state: 'PLANNING',
          startDate: createNext.startDate ? new Date(createNext.startDate) : null,
          endDate: createNext.endDate ? new Date(createNext.endDate) : null,
          goal: typeof createNext.goal === 'string' ? createNext.goal : null,
          departmentId: sprint.departmentId,
          columns: {
            create: sprint.columns.map(c => ({
              name: c.name, statusKey: c.statusKey, position: c.position, color: c.color,
            })),
          },
        },
        select: { id: true },
      })
      resolvedNextId = created.id
      // Dispositions computed pre-transaction used null; stamp the real id now.
      for (const d of dispositions) if (d.action === 'next') d.toSprintId = resolvedNextId
    }

    // BR-04 — lane maxima in the destination sprint, per status.
    const laneMax = new Map<string, number>()
    if (resolvedNextId) {
      const destTodos = await tx.todo.findMany({
        where: { sprintId: resolvedNextId },
        select: { status: true, sprintPosition: true },
      })
      for (const t of destTodos) {
        laneMax.set(t.status, Math.max(laneMax.get(t.status) ?? 0, t.sprintPosition))
      }
    }
    // BR-04 — global kanban column maxima (sprintId null), per status.
    const backlogMax = new Map<string, number>()
    {
      const backlogTodos = await tx.todo.findMany({
        where: { sprintId: null },
        select: { status: true, sortOrder: true },
      })
      for (const t of backlogTodos) {
        backlogMax.set(t.status, Math.max(backlogMax.get(t.status) ?? 0, t.sortOrder))
      }
    }

    const laneOffsets = new Map<string, number>()
    const backlogOffsets = new Map<string, number>()
    let movedToNext = 0, movedToBacklog = 0, cancelled = 0
    const carried: CloseSprintResult['notify']['carried'] = []
    const cancelledTodos: CloseSprintResult['notify']['cancelledTodos'] = []

    for (const todo of incompleteTodos) {
      const d = dispositions.find(x => x.todoId === todo.id)!
      if (d.action === 'next' && resolvedNextId) {
        const off = laneOffsets.get(todo.status) ?? 0
        laneOffsets.set(todo.status, off + 1)
        const sprintPosition = carriedPosition(laneMax.get(todo.status) ?? 0, off)
        await tx.todo.update({
          where: { id: todo.id },
          data: { sprintId: resolvedNextId, sprintPosition, ...buildCarryoverPatch(todo, sprintId, now) },
        })
        movedToNext++
        carried.push({ todoId: todo.id, title: todo.title, assigneeId: todo.assigneeId })
      } else if (d.action === 'cancel') {
        await tx.todo.update({
          where: { id: todo.id },
          data: { status: 'CANCELLED', sprintId: null, sprintPosition: 0 },
        })
        cancelled++
        cancelledTodos.push({ todoId: todo.id, title: todo.title, assigneeId: todo.assigneeId })
      } else {
        const off = backlogOffsets.get(todo.status) ?? 0
        backlogOffsets.set(todo.status, off + 1)
        const sortOrder = backlogSortOrder(backlogMax.get(todo.status) ?? 0, off)
        await tx.todo.update({
          where: { id: todo.id },
          data: { sprintId: null, sprintPosition: 0, sortOrder },
        })
        movedToBacklog++
      }
      await recordActivity({
        entityType: 'TODO', todoId: todo.id, sprintId,
        action: 'INITIATIVE_SPRINT_CHANGED',
        actorId,
        changes: { sprintId: { from: sprintId, to: d.action === 'next' ? resolvedNextId : null } },
        metadata: { reason: d.action, sourceSprintId: sprintId, nextSprintId: d.action === 'next' ? resolvedNextId : null },
      })
    }

    const completedCount = await tx.todo.count({ where: { sprintId, status: 'COMPLETED' } })

    await tx.sprint.update({
      where: { id: sprintId },
      data: {
        state: targetState,
        endedAt: now,
        endedById: actorId,
        reflectionNote: payload.reflectionNote ?? null,
      },
    })

    // BR-05 — persisted completion summary (re-close after reopen overwrites).
    await tx.sprintCompletionSummary.upsert({
      where: { sprintId },
      create: {
        sprintId,
        completedCount,
        incompleteCount: incompleteTodos.length,
        movedToNext,
        movedToBacklog,
        cancelledCount: cancelled,
        nextSprintId: resolvedNextId,
        dispositions: JSON.stringify(dispositions),
        goalLabel: sprint.goalLabel,
        goalTarget: sprint.goalTarget,
        goalCurrent: sprint.goalCurrent,
        goalUnit: sprint.goalUnit,
        reflectionNote: payload.reflectionNote ?? null,
      },
      update: {
        completedCount,
        incompleteCount: incompleteTodos.length,
        movedToNext,
        movedToBacklog,
        cancelledCount: cancelled,
        nextSprintId: resolvedNextId,
        dispositions: JSON.stringify(dispositions),
        goalLabel: sprint.goalLabel,
        goalTarget: sprint.goalTarget,
        goalCurrent: sprint.goalCurrent,
        goalUnit: sprint.goalUnit,
        reflectionNote: payload.reflectionNote ?? null,
        reopenedAt: null,
        reopenedById: null,
      },
    })

    await recordActivity({
      entityType: 'SPRINT', sprintId,
      action: targetState === 'COMPLETED' ? 'SPRINT_ENDED' : 'SPRINT_CANCELLED',
      actorId,
      metadata: {
        completedCount,
        incompleteCount: incompleteTodos.length,
        movedToNext, movedToBacklog, cancelled,
        reflectionNote: payload.reflectionNote ?? null,
      },
    })

    let nextSprintName: string | null = null
    if (resolvedNextId) {
      const n = await tx.sprint.findUnique({ where: { id: resolvedNextId }, select: { name: true } })
      nextSprintName = n?.name ?? null
    }

    return {
      summary: {
        completedCount,
        incompleteCount: incompleteTodos.length,
        movedToNext, movedToBacklog, cancelled,
        nextSprintId: resolvedNextId,
      },
      notify: {
        sprintName: sprint.name,
        nextSprintName,
        participantIds: sprint.participants.map(p => p.userId),
        ownerId: sprint.ownerId,
        carried,
        cancelledTodos,
      },
    }
  })

  return {
    sprintId,
    targetState,
    summary: result.summary,
    dispositions,
    warnings,
    notify: result.notify,
  }
}
