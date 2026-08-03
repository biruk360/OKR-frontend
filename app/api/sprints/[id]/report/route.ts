import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import {
  apiSuccess,
  apiBadRequest,
  apiError,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'
import { canViewSprint, type UserRole } from '@/lib/permissions'
import { completionRate, canReopen, REOPEN_WINDOW_DAYS } from '@/lib/sprints/end-sprint'

interface DispositionRow {
  todoId: string
  title: string
  fromStatus: string
  action: 'next' | 'backlog' | 'cancel'
  toSprintId: string | null
}

/**
 * GET /api/sprints/[id]/report — sprint report for a closed sprint (BR-09).
 *
 * Counts come from the persisted SprintCompletionSummary (BR-05); task rows are
 * resolved live so titles/assignees stay current. Legacy backfilled summaries
 * return counts only, with `backfilled: true`.
 */
export const GET = withAuth<RouteIdParams>(async (_request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      participants: { select: { userId: true } },
      endedBy: { select: { id: true, name: true, avatar: true } },
      completionSummary: { include: { reopenedBy: { select: { id: true, name: true } } } },
    },
  })
  if (!sprint) return apiNotFound('Sprint not found')

  const role = session.user.role as UserRole
  const allowed = await canViewSprint(role, session.user.id, {
    ownerId: sprint.ownerId,
    departmentId: sprint.departmentId,
    participants: sprint.participants,
  })
  if (!allowed) return apiForbidden('Insufficient permissions to view this sprint report')

  if (sprint.state !== 'COMPLETED' && sprint.state !== 'CANCELLED') {
    return apiError('Report is available once the sprint is closed', { status: 409, code: 'SPRINT_NOT_CLOSED' })
  }

  const summary = sprint.completionSummary

  // Completed tasks are resolved live (they stayed attached to the sprint).
  const completedTodos = await prisma.todo.findMany({
    where: { sprintId: id, status: 'COMPLETED' },
    select: {
      id: true, title: true, completedAt: true,
      assignee: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { completedAt: 'asc' },
  })

  let dispositions: DispositionRow[] = []
  let backfilled = false
  if (summary?.dispositions) {
    try {
      const parsed = JSON.parse(summary.dispositions)
      if (Array.isArray(parsed)) dispositions = parsed
      else if (parsed?.backfilled) backfilled = true
    } catch { backfilled = true }
  }

  // Live-resolve dispositioned tasks (titles/assignees may have changed since close).
  const dispositionIds = dispositions.map(d => d.todoId)
  const liveTodos = dispositionIds.length
    ? await prisma.todo.findMany({
        where: { id: { in: dispositionIds } },
        select: {
          id: true, title: true, status: true, carryoverCount: true,
          assignee: { select: { id: true, name: true, avatar: true } },
        },
      })
    : []
  const liveMap = new Map(liveTodos.map(t => [t.id, t]))

  const nextSprintIds = Array.from(new Set(dispositions.map(d => d.toSprintId).filter(Boolean))) as string[]
  const nextSprints = nextSprintIds.length
    ? await prisma.sprint.findMany({ where: { id: { in: nextSprintIds } }, select: { id: true, name: true } })
    : []
  const nextSprintMap = new Map(nextSprints.map(s => [s.id, s.name]))

  const resolve = (d: DispositionRow) => {
    const live = liveMap.get(d.todoId)
    return {
      id: d.todoId,
      title: live?.title ?? d.title,
      status: live?.status ?? null,
      assignee: live?.assignee ?? null,
      fromStatus: d.fromStatus,
      ...(d.action === 'next' && {
        toSprintId: d.toSprintId,
        toSprintName: d.toSprintId ? nextSprintMap.get(d.toSprintId) ?? null : null,
        carryoverCount: live?.carryoverCount ?? null,
      }),
    }
  }

  const carried = dispositions.filter(d => d.action === 'next').map(resolve)
  const backlogged = dispositions.filter(d => d.action === 'backlog').map(resolve)
  const cancelled = dispositions.filter(d => d.action === 'cancel').map(resolve)

  const total = (summary?.completedCount ?? completedTodos.length) + (summary?.incompleteCount ?? 0)

  return apiSuccess({
    sprint: {
      id: sprint.id,
      name: sprint.name,
      state: sprint.state,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      endedAt: sprint.endedAt,
      endedBy: sprint.endedBy,
      reflectionNote: sprint.reflectionNote ?? summary?.reflectionNote ?? null,
      goal: {
        label: summary?.goalLabel ?? sprint.goalLabel,
        target: summary?.goalTarget ?? sprint.goalTarget,
        currentAtClose: summary?.goalCurrent ?? sprint.goalCurrent,
        unit: summary?.goalUnit ?? sprint.goalUnit,
      },
    },
    counts: {
      total,
      completed: summary?.completedCount ?? completedTodos.length,
      carriedToNext: summary?.movedToNext ?? carried.length,
      backlogged: summary?.movedToBacklog ?? backlogged.length,
      cancelled: summary?.cancelledCount ?? cancelled.length,
      completionRate: completionRate(summary?.completedCount ?? completedTodos.length, total),
    },
    groups: {
      completed: completedTodos,
      carriedToNext: carried,
      backlogged,
      cancelled,
    },
    backfilled,
    reopen: {
      windowDays: REOPEN_WINDOW_DAYS,
      available: sprint.state === 'COMPLETED' && canReopen(sprint.endedAt, new Date()),
      reopened: summary?.reopenedAt
        ? { at: summary.reopenedAt, by: summary.reopenedBy }
        : null,
    },
  })
})
