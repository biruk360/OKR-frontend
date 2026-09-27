/**
 * lib/todos/visibility.ts — the single source of truth for "which to-dos may this
 * user see on this surface" (calendar spec CPM-2, CPM-10, A6).
 *
 * Before this module three different inline rules decided visibility (spec §1.4):
 * the /dashboard/todos SSR page, `GET /api/todos?mine=all` (which the to-dos page
 * and the work board used to refresh from, so lists shrank after every edit) and
 * the /dashboard/work SSR page. Every surface now builds its `where` here, so the
 * SSR render and the client refresh of a page return the same set and shape.
 *
 * Rule per surface (then ANDed with `buildScopeFilter(user, 'todo')`):
 *
 *   surface | unrestricted base       | everyone else sees a to-do when they are…
 *   --------|-------------------------|--------------------------------------------------
 *   todos   | ADMIN                   | assignee · creator · KR owner · KR's objective owner · objective owner
 *   work    | ADMIN, EXECUTIVE        | assignee · creator · card member
 *   mine    | (nobody)                | assignee · card member
 *
 * Client-portal sessions (`userType: 'CLIENT_PORTAL'`) never see internal to-dos:
 * the builder returns a where that matches no row, and callers reject them first.
 *
 * Record scope: `buildScopeFilter` returns null when no RecordScopeRule applies or a
 * role has `applyScoping=false` for `todo` (the seeded ADMIN/EXECUTIVE roles). It has
 * no ADMIN shortcut of its own — a rule targeting the ADMIN role or an admin user
 * would restrict them too, which is the intended A6 behaviour. The seeded EMPLOYEE
 * rule is the participant scope (`todoParticipantScopeWhere` below: assignee ·
 * creator · member · watcher · owner/participant of the card's sprint). It does NOT
 * include KR / objective ownership, so on the `todos` surface an EMPLOYEE no longer
 * sees a card they only relate to by owning its KR or objective (user decision
 * 2026-09-25); `work` and `mine` lose nothing for employees.
 *
 * Caps and ordering (decided here so SSR and refresh can never drift):
 *   - todos / mine: ordered status ↑, dueDate ↑, updatedAt ↓; capped at 500 rows
 *     on both the SSR page and the `?surface=` refresh.
 *   - work: ordered status ↑, dueDate ↑, createdAt ↓; no cap (unchanged from the
 *     work page's SSR), on both SSR and refresh.
 *
 * The builder is pure apart from the injected scope-filter lookup, so the role matrix
 * is unit-tested in `visibility.test.ts` without a database.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

export const TODO_SURFACES = ['todos', 'work', 'mine'] as const
export type TodoSurface = (typeof TODO_SURFACES)[number]

export function isTodoSurface(value: unknown): value is TodoSurface {
  return typeof value === 'string' && (TODO_SURFACES as readonly string[]).includes(value)
}

/** The subset of the session user the rules depend on. */
export interface VisibilityUser {
  id: string
  role: string
  userType?: string | null
}

/**
 * Resolves the record-scope fragment for a user + doctype. Production uses
 * `buildScopeFilter` from `lib/apply-scope.ts`; tests inject a stub.
 */
export type ScopeFilterFn = (
  userId: string,
  doctypeKey: string,
) => Promise<Record<string, unknown> | null>

/** Matches no row. Used for sessions that must never see internal to-dos. */
export const NO_TODO_ROWS: Prisma.TodoWhereInput = { id: { in: [] } }

/** Roles whose base rule is "everything" on a surface (before record scope). */
const UNRESTRICTED_ROLES: Record<TodoSurface, readonly string[]> = {
  todos: ['ADMIN'],
  work: ['ADMIN', 'EXECUTIVE'],
  mine: [],
}

export function isClientPortalUser(user: Pick<VisibilityUser, 'userType'>): boolean {
  return user.userType === 'CLIENT_PORTAL'
}

/**
 * The per-surface participation rule, before record scope.
 * Returns `null` when the role is unrestricted on this surface.
 */
export function baseTodoVisibilityWhere(
  user: VisibilityUser,
  surface: TodoSurface,
): Prisma.TodoWhereInput | null {
  if (isClientPortalUser(user)) return NO_TODO_ROWS
  if (UNRESTRICTED_ROLES[surface].includes(user.role)) return null

  const userId = user.id
  switch (surface) {
    case 'todos':
      return {
        OR: [
          { assigneeId: userId },
          { creatorId: userId },
          { keyResult: { ownerId: userId } },
          { keyResult: { objective: { ownerId: userId } } },
          { objective: { ownerId: userId } },
          // The participant scope grants card members and invited sprint
          // people; the base rule is ANDed with it, so without these clauses
          // those cards were scoped in and then filtered straight back out — an
          // employee's to-dos page never showed the cards they were added to or
          // the sprints they were invited to. (Watched cards need a DB lookup
          // and stay read-only via the scope, not listed here.)
          { members: { some: { userId } } },
          { sprint: { ownerId: userId } },
          { sprint: { participants: { some: { userId } } } },
        ],
      }
    case 'work':
      return {
        OR: [
          { assigneeId: userId },
          { creatorId: userId },
          { members: { some: { userId } } },
        ],
      }
    case 'mine':
      return {
        OR: [{ assigneeId: userId }, { members: { some: { userId } } }],
      }
  }
}

// ---------------------------------------------------------------------------
// Participant record scope (`is_participant` RecordScopeRule on doctype `todo`)
// ---------------------------------------------------------------------------

/**
 * The RecordScopeRule that gives a role the participant to-do scope. The seeded
 * EMPLOYEE rule (scripts/seed-permissions.ts) and the one-off migration
 * (scripts/update-employee-todo-scope.ts) both write exactly this row; the scope
 * engine (lib/apply-scope.ts) resolves it through `todoParticipantScopeWhere`.
 */
export const TODO_PARTICIPANT_SCOPE_RULE = {
  doctypeKey: 'todo',
  fieldName: 'participant',
  operator: 'is_participant',
  valueType: 'user_id',
} as const

/** Scope actions under which a watched card counts as "own" (read-type only). */
const WATCH_SCOPE_ACTIONS: ReadonlySet<string> = new Set(['read'])

/**
 * The participant to-do scope (user decision 2026-09-25, docs/REMEDIATION_PLAN
 * "Decisions"): the user's own cards — assignee, creator, card member, watcher —
 * plus every card on a sprint they own or participate in (lines up with the
 * invite-only sprint rule: sprint owner + participants see the board and may
 * edit every card on it).
 *
 * Watching is a READ relationship only. `POST /api/watchers` lets anyone watch
 * any id, so a watch must never widen write/delete scope: the watched-card
 * clause is included only when `action` is absent (list reads) or `'read'`, and
 * the watch lookup is skipped otherwise.
 */
export async function todoParticipantScopeWhere(
  userId: string,
  action: string | undefined,
  loadWatchedTodoIds: (userId: string) => Promise<string[]>,
): Promise<Prisma.TodoWhereInput> {
  const OR: Prisma.TodoWhereInput[] = [
    { assigneeId: userId },
    { creatorId: userId },
    { members: { some: { userId } } },
    { sprint: { ownerId: userId } },
    { sprint: { participants: { some: { userId } } } },
  ]
  if (action === undefined || WATCH_SCOPE_ACTIONS.has(action)) {
    const watched = await loadWatchedTodoIds(userId)
    if (watched.length > 0) OR.push({ id: { in: watched } })
  }
  return { OR }
}

/** AND the base rule with the record-scope fragment. Either may be absent. */
export function composeTodoVisibilityWhere(
  base: Prisma.TodoWhereInput | null,
  scope: Record<string, unknown> | null,
): Prisma.TodoWhereInput {
  const scopeWhere = scope as Prisma.TodoWhereInput | null
  if (!base && !scopeWhere) return {}
  if (!base) return { AND: [scopeWhere!] }
  if (!scopeWhere) return base
  return { AND: [base, scopeWhere] }
}

const defaultScopeFilter: ScopeFilterFn = async (userId, doctypeKey) => {
  // Lazy import keeps this module free of a Prisma client at load time, so the
  // pure builder above can be unit-tested without a database.
  const { buildScopeFilter } = await import('../apply-scope')
  return buildScopeFilter(userId, doctypeKey)
}

/**
 * The `where` for the to-dos `user` may see on `surface`: the surface's participation
 * rule ANDed with the user's `todo` record scope (CPM-2 / CPM-10 / A6).
 */
export async function todoVisibilityWhere(
  user: VisibilityUser,
  surface: TodoSurface,
  scopeFilter: ScopeFilterFn = defaultScopeFilter,
): Promise<Prisma.TodoWhereInput> {
  if (isClientPortalUser(user)) return NO_TODO_ROWS
  const base = baseTodoVisibilityWhere(user, surface)
  const scope = await scopeFilter(user.id, 'todo')
  return composeTodoVisibilityWhere(base, scope)
}

// ---------------------------------------------------------------------------
// Row shapes per surface — shared by the SSR pages and `GET /api/todos?surface=`
// so a client refresh returns rows identical to the server render.
// ---------------------------------------------------------------------------

const userSummary = { select: { id: true, name: true, avatar: true } } as const
const objectiveWithTimeframe = {
  select: {
    id: true,
    title: true,
    level: true,
    timeframe: { select: { id: true, name: true } },
  },
} as const

/** Include used by the to-dos list (`todos`) and the personal list (`mine`). */
export const TODOS_SURFACE_INCLUDE = {
  assignee: userSummary,
  creator: userSummary,
  keyResult: {
    select: { id: true, title: true, objective: objectiveWithTimeframe },
  },
  objective: objectiveWithTimeframe,
} satisfies Prisma.TodoInclude

export const TODOS_SURFACE_ORDER_BY: Prisma.TodoOrderByWithRelationInput[] = [
  { status: 'asc' },
  { dueDate: 'asc' },
  { updatedAt: 'desc' },
]

/** Row cap for the to-dos list, applied identically to SSR and refresh. */
export const TODOS_SURFACE_TAKE = 500

/** Include used by the work board (`work`). */
export const WORK_SURFACE_INCLUDE = {
  assignee: userSummary,
  creator: userSummary,
  members: { include: { user: userSummary } },
  labels: { include: { labelDef: true } },
  checklists: { include: { items: { select: { id: true, completed: true } } } },
  attachments: { select: { id: true } },
  keyResult: { select: { id: true, title: true, objective: { select: { id: true, title: true } } } },
  objective: { select: { id: true, title: true } },
} satisfies Prisma.TodoInclude

export const WORK_SURFACE_ORDER_BY: Prisma.TodoOrderByWithRelationInput[] = [
  { status: 'asc' },
  { dueDate: 'asc' },
  { createdAt: 'desc' },
]

type TodosSurfaceRecord = Prisma.TodoGetPayload<{ include: typeof TODOS_SURFACE_INCLUDE }>

interface UserSummary {
  id: string
  name: string
  avatar: string | null
}

interface ObjectiveSummary {
  id: string
  title: string
  level: string
  timeframeName: string
}

/** Serialized row of the to-dos list. Structurally identical to `TodoRow` / `TodoItem`. */
export interface TodosSurfaceRow {
  id: string
  cardNumber: number
  archivedAt: string | null
  title: string
  description: string | null
  status: string
  dueDate: string | null
  completedAt: string | null
  assignee: UserSummary | null
  creator: UserSummary
  keyResultId: string | null
  keyResult: { id: string; title: string; objective: ObjectiveSummary } | null
  objectiveId: string | null
  objective: ObjectiveSummary | null
  createdAt: string
  updatedAt: string
}

export function mapTodosSurfaceRow(t: TodosSurfaceRecord): TodosSurfaceRow {
  return {
    id: t.id,
    cardNumber: t.cardNumber,
    archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
    title: t.title,
    description: t.description,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    assignee: t.assignee,
    creator: t.creator,
    keyResultId: t.keyResultId,
    keyResult: t.keyResult
      ? {
          id: t.keyResult.id,
          title: t.keyResult.title,
          objective: {
            id: t.keyResult.objective.id,
            title: t.keyResult.objective.title,
            level: t.keyResult.objective.level,
            timeframeName: t.keyResult.objective.timeframe.name,
          },
        }
      : null,
    objectiveId: t.objectiveId,
    objective: t.objective
      ? {
          id: t.objective.id,
          title: t.objective.title,
          level: t.objective.level,
          timeframeName: t.objective.timeframe.name,
        }
      : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

type TodoReader = Pick<PrismaClient, 'todo'>

/** Rows of the to-dos list (`todos`) or the personal list (`mine`), SSR/refresh alike. */
export async function findTodosSurfaceRows(
  db: TodoReader,
  user: VisibilityUser,
  surface: 'todos' | 'mine',
  scopeFilter?: ScopeFilterFn,
): Promise<TodosSurfaceRow[]> {
  const where = await todoVisibilityWhere(user, surface, scopeFilter)
  const rows = await db.todo.findMany({
    where,
    include: TODOS_SURFACE_INCLUDE,
    orderBy: TODOS_SURFACE_ORDER_BY,
    take: TODOS_SURFACE_TAKE,
  })
  return rows.map(mapTodosSurfaceRow)
}

/**
 * Rows of the work board, JSON-serialized exactly as the page hands them to the
 * client (dates as ISO strings), so the refresh keeps members/labels/checklists.
 */
export async function findWorkSurfaceRows(
  db: TodoReader,
  user: VisibilityUser,
  scopeFilter?: ScopeFilterFn,
): Promise<unknown[]> {
  const where = await todoVisibilityWhere(user, 'work', scopeFilter)
  const rows = await db.todo.findMany({
    where,
    include: WORK_SURFACE_INCLUDE,
    orderBy: WORK_SURFACE_ORDER_BY,
  })
  return JSON.parse(JSON.stringify(rows)) as unknown[]
}
