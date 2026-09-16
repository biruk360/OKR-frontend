import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { getSprintLanes, resolveLane } from '@/lib/sprints/columns'

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
  // Checklist + comment + attachment counts power the card meta-row badges
  // (Trello-style). `description` is returned so the card can show the
  // "has description" glyph without a second request.
  checklists: { include: { items: { select: { completed: true } } } },
  todoComments: { select: { id: true } },
  _count: { select: { attachments: true } },
  keyResult: {
    select: {
      id: true,
      title: true,
      objective: { select: { id: true, title: true, level: true, timeframe: { select: { name: true } } } },
    },
  },
  objective: { select: { id: true, title: true, level: true, timeframe: { select: { name: true } } } },
} as const


export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
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

  const lanes = await getSprintLanes(id)

  const todos = await prisma.todo.findMany({
    // Exclude AI-draft todos (aiSuggested=true means "still in review") so they
    // don't appear on the kanban before the user accepts them via the review page.
    // Once accepted, /api/sprints/ai/:planId/accept flips aiSuggested=false.
    where: { sprintId: id, aiSuggested: false },
    // Order by createdAt asc within each column so newly created todos always
    // append at the bottom of their lane (the user's expectation). Avoid sorting
    // by dueDate here — null due dates can appear above existing dated tasks
    // depending on DB null-ordering, which made fresh todos jump to the top.
    // Grouping is done by lane below, so ordering only needs to be correct
    // *within* a lane. Ordering by status first would interleave lanes that
    // share a statusKey.
    orderBy: [{ sprintPosition: 'asc' }, { createdAt: 'asc' }],
    include: TODO_INCLUDE,
  })

  // Watch state for the viewer. `Watcher` is a polymorphic table keyed by
  // (entityType, entityId) rather than a Prisma relation on Todo, so it cannot
  // be `include`d — one extra query covers the whole board.
  //
  // Until now nothing populated this, so the watcher badge TaskCardTrello
  // renders could never appear for anyone (spec CRD-4 / API-10).
  const watchedIds = todos.length
    ? new Set(
        (
          await prisma.watcher.findMany({
            where: {
              userId: session.user.id,
              entityType: 'TODO',
              entityId: { in: todos.map(t => t.id) },
            },
            select: { entityId: true },
          })
        ).map(w => w.entityId),
      )
    : new Set<string>()

  // Bucket todos into the sprint's lanes. A card goes in its own `columnId`
  // lane when that lane is still active, else the first lane matching its
  // status — which keeps pre-backfill rows and cards whose lane was archived
  // visible instead of silently vanishing.
  //
  // Cards whose status no lane represents (e.g. CANCELLED) are intentionally
  // excluded from the board but remain reachable via /api/todos.
  const byLane = new Map<string, typeof todos>()
  for (const t of todos) {
    const lane = resolveLane(lanes, t)
    if (!lane) continue
    const bucket = byLane.get(lane.id)
    if (bucket) bucket.push(t)
    else byLane.set(lane.id, [t])
  }

  const columns = lanes.map(lane => ({
    id: lane.id,
    name: lane.name,
    // `status` is kept on the payload because the client still uses it for
    // status-derived affordances (the mobile tab strip, the quick-add lane).
    status: lane.statusKey,
    statusKey: lane.statusKey,
    color: lane.color,
    position: lane.position,
    todos: (byLane.get(lane.id) ?? []).map(t => ({
      ...t,
      // Shape matches TaskCardTrello's `watchers?: { userId: string }[]`.
      // Scoped to the viewer: the badge means "you are watching this".
      watchers: watchedIds.has(t.id) ? [{ userId: session.user.id }] : [],
    })),
    cardCount: byLane.get(lane.id)?.length ?? 0,
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
