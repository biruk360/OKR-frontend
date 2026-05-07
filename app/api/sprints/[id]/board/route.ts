import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'

/**
 * GET /api/sprints/[id]/board — Phase 2 read-API shim.
 *
 * Returns the sprint board in Todo-shape (single source of truth) so Phase 3
 * can swap UI components onto this endpoint without touching SprintActivity.
 *
 * This endpoint is READ-ONLY and does NOT touch SprintActivity. The legacy
 * board endpoint at /api/sprints/[id] (which still reads SprintActivity) keeps
 * working in parallel until Phase 3 retires the UI consumers.
 */
const TODO_INCLUDE = {
  assignee: { select: { id: true, name: true, avatar: true } },
  creator:  { select: { id: true, name: true, avatar: true } },
  members:  { include: { user: { select: { id: true, name: true, avatar: true } } } },
  labels:   { include: { labelDef: true } },
  // Checklist + comment counts power the card meta-row badges (Trello-style).
  checklists: { include: { items: { select: { completed: true } } } },
  todoComments: { select: { id: true } },
  keyResult: {
    select: {
      id: true,
      title: true,
      objective: { select: { id: true, title: true, level: true, timeframe: { select: { name: true } } } },
    },
  },
  objective: { select: { id: true, title: true, level: true, timeframe: { select: { name: true } } } },
} as const

const COLUMN_DEFS = [
  { id: 'PENDING',     name: 'To Do',       status: 'PENDING' as const },
  { id: 'IN_PROGRESS', name: 'In Progress', status: 'IN_PROGRESS' as const },
  { id: 'IN_REVIEW',   name: 'In Review',   status: 'IN_REVIEW' as const },
  { id: 'STUCK',       name: 'Stuck',       status: 'STUCK' as const },
  { id: 'COMPLETED',   name: 'Done',        status: 'COMPLETED' as const },
]

export const GET = withAuth<RouteIdParams>(async (_request, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid sprint id')

  const sprint = await prisma.sprint.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      department: { select: { id: true, name: true } },
      participants: {
        include: { user: { select: { id: true, name: true, avatar: true, email: true, role: true } } },
      },
    },
  })
  if (!sprint) return apiNotFound('Sprint not found')

  const todos = await prisma.todo.findMany({
    // Exclude AI-draft todos (aiSuggested=true means "still in review") so they
    // don't appear on the kanban before the user accepts them via the review page.
    // Once accepted, /api/sprints/ai/:planId/accept flips aiSuggested=false.
    where: { sprintId: id, aiSuggested: false },
    // Order by createdAt asc within each column so newly created todos always
    // append at the bottom of their lane (the user's expectation). Avoid sorting
    // by dueDate here — null due dates can appear above existing dated tasks
    // depending on DB null-ordering, which made fresh todos jump to the top.
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    include: TODO_INCLUDE,
  })

  // Bucket todos into Phase 3 columns. Anything not matching a known status
  // (e.g. CANCELLED) is intentionally excluded from the board view but still
  // accessible via the standard /api/todos endpoints.
  const columns = COLUMN_DEFS.map(col => ({
    ...col,
    todos: todos.filter(t => t.status === col.status),
  }))

  // Aggregates for the sprint header strip.
  const taskTotal   = todos.length
  const taskDone    = todos.filter(t => t.status === 'COMPLETED').length
  const taskPercent = taskTotal === 0 ? 0 : Math.round((taskDone / taskTotal) * 100)
  const goalPercent =
    sprint.goalTarget && sprint.goalTarget > 0
      ? Math.min(100, Math.round(((sprint.goalCurrent ?? 0) / sprint.goalTarget) * 100))
      : null

  const participants = sprint.participants.map(p => p.user)

  return apiSuccess({
    sprint: {
      id: sprint.id,
      name: sprint.name,
      description: sprint.description,
      state: sprint.state,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      goal: sprint.goal,
      goalLabel: sprint.goalLabel,
      goalTarget: sprint.goalTarget,
      goalCurrent: sprint.goalCurrent,
      goalUnit: sprint.goalUnit,
      reflectionNote: sprint.reflectionNote,
      endedAt: sprint.endedAt,
      background: sprint.background ?? 'none',
      owner: sprint.owner,
      department: sprint.department,
    },
    columns,
    participants,
    aggregates: { taskTotal, taskDone, taskPercent, goalPercent },
  })
})
