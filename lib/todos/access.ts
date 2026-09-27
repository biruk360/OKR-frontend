/**
 * To-do (card) access rules — the single source of truth for "may this user
 * change this card?" and "may this user read this card?".
 *
 *   read  = `canReadTodo`   — GET /api/todos/[id], checklists GET, comments GET,
 *                             activity, attachment download, share, watchers,
 *                             duplicate (source). Unreadable answers 404.
 *   write = `canWriteTodo`  — PATCH /api/todos/[id], checklists, labels,
 *                             members, comments POST/PATCH/DELETE, attachment
 *                             upload/delete. Via `todoWriteGuard`: 404 when the
 *                             caller cannot even read the card, 403 when they can
 *                             read but not write, 409 SPRINT_CLOSED on a closed sprint.
 *
 * `canAccessAttachmentScope('TODO', …)` (lib/attachments/access.ts) delegates
 * here, so there is one rule set for the card and all its sub-resources.
 *
 * The file is split into pure verdicts (unit-tested in access.test.ts with no
 * database) and thin DB-backed loaders that gather the facts and call them.
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import {
  canEditKeyResultWithObjectiveContext,
  canViewKeyResult,
  canViewObjective,
  canViewSprint,
  isSprintMember,
  type UserRole,
} from '@/lib/permissions'
import { resolveDocTypePermission } from '@/lib/permission-resolver'
import { buildScopeFilter } from '@/lib/apply-scope'
import { apiError, apiForbidden, apiNotFound } from '@/lib/api'
import { todoVisibilityWhere, type ScopeFilterFn } from './visibility'

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

export interface TodoParticipantAccess {
  assigneeId: string | null
  creatorId: string
  memberIds: string[]
}

export function hasTodoParticipantWriteAccess(
  userId: string,
  todo: TodoParticipantAccess,
): boolean {
  return (
    todo.assigneeId === userId ||
    todo.creatorId === userId ||
    todo.memberIds.includes(userId)
  )
}

/** Roles that may edit any card regardless of their relationship to it. */
export const TODO_WRITE_ROLES: readonly string[] = ['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD']

/** The facts the write decision depends on, gathered by `canWriteTodo`. */
export interface TodoWriteFacts {
  role: string
  /** Client-portal sessions never write internal cards (overrides everything). */
  isClientPortal?: boolean
  /** Assignee, creator or explicit member of the card. */
  isParticipant: boolean
  /**
   * The card is in a sprint and the actor is that sprint's owner or a
   * SprintParticipant — participants may edit every card in their sprint
   * (decision 4). Closed sprints are still refused, by the guards (409).
   */
  isSprintMember?: boolean
  /** May edit the Key Result the card is linked to (KR/objective manager). */
  managesLinkedKr: boolean
  /**
   * DB-RBAC `todo:write` granted and the card inside the user's write scope.
   * `null` when RBAC was not consulted or could not be evaluated (tables not
   * yet migrated) — treated as "no extra grant", never as a denial.
   */
  rbacScopedWrite: boolean | null
}

/**
 * Legacy (hard-coded) write access: participant, sprint member, KR manager, or
 * a manager role. DB-RBAC may expand this but must never revoke it.
 */
export function legacyTodoWriteVerdict(facts: Omit<TodoWriteFacts, 'rbacScopedWrite'>): boolean {
  if (facts.isClientPortal) return false
  return (
    facts.isParticipant ||
    facts.isSprintMember === true ||
    facts.managesLinkedKr ||
    TODO_WRITE_ROLES.includes(facts.role)
  )
}

export function todoWriteVerdict(facts: TodoWriteFacts): boolean {
  if (facts.isClientPortal) return false
  return legacyTodoWriteVerdict(facts) || facts.rbacScopedWrite === true
}

/** COMPLETED and CANCELLED sprints are read-only (CDM-11 / BR-06). */
export function isClosedSprintState(state: string | null | undefined): boolean {
  return state === 'COMPLETED' || state === 'CANCELLED'
}

/**
 * A checklist may only be touched through the card it belongs to. Without this,
 * `/api/todos/A/checklists/<checklist of card B>` would pass card A's permission
 * check and then mutate card B.
 */
export function checklistBelongsToTodo(
  checklist: { todoId: string } | null | undefined,
  todoId: string,
): boolean {
  return !!checklist && checklist.todoId === todoId
}

/** Same pinning rule for an item: item → its checklist → the URL's card and checklist. */
export function checklistItemBelongsToTodo(
  item: { checklistId: string; checklist: { todoId: string } } | null | undefined,
  todoId: string,
  checklistId: string,
): boolean {
  return !!item && item.checklistId === checklistId && item.checklist.todoId === todoId
}

// ---------------------------------------------------------------------------
// DB-backed checks
// ---------------------------------------------------------------------------

export interface TodoActor {
  id: string
  role: string
  /** `'CLIENT_PORTAL'` sessions never read or write internal cards. */
  userType?: string | null
}

/** The card's sprint as the access rules see it. */
export interface TodoSprintAccess {
  ownerId: string
  participants: { userId: string }[]
  departmentId?: string | null
  state?: string
}

/** The card fields the write rule reads. `PATCH /api/todos/[id]` loads a superset. */
export interface TodoWriteSubject {
  id: string
  assigneeId: string | null
  creatorId: string
  members: { userId: string }[]
  keyResult: {
    ownerId: string
    objectiveId: string
    objective: { level: string; ownerId: string; departmentId: string | null }
  } | null
  /**
   * The card's sprint. When omitted (`undefined`) the sprint facts are loaded
   * from `sprintId` (or the card id); `null` means "not in a sprint".
   */
  sprint?: TodoSprintAccess | null
  sprintId?: string | null
}

const SPRINT_ACCESS_SELECT = {
  select: {
    ownerId: true,
    departmentId: true,
    state: true,
    participants: { select: { userId: true } },
  },
} as const

const TODO_WRITE_SELECT = {
  id: true,
  assigneeId: true,
  creatorId: true,
  sprintId: true,
  members: { select: { userId: true } },
  keyResult: {
    select: {
      ownerId: true,
      objectiveId: true,
      objective: { select: { level: true, ownerId: true, departmentId: true } },
    },
  },
  sprint: SPRINT_ACCESS_SELECT,
} as const

async function loadWriteSubject(todoId: string): Promise<TodoWriteSubject | null> {
  return prisma.todo.findUnique({ where: { id: todoId }, select: TODO_WRITE_SELECT })
}

/** The card's sprint, from the subject when present, else loaded (null = no sprint). */
async function resolveTodoSprint(todo: TodoWriteSubject): Promise<TodoSprintAccess | null> {
  if (todo.sprint !== undefined) return todo.sprint
  if (todo.sprintId === null) return null
  if (typeof todo.sprintId === 'string') {
    return prisma.sprint.findUnique({ where: { id: todo.sprintId }, ...SPRINT_ACCESS_SELECT })
  }
  const row = await prisma.todo.findUnique({ where: { id: todo.id }, select: { sprint: SPRINT_ACCESS_SELECT } })
  return row?.sprint ?? null
}

/**
 * Whether `actor` may modify the card: creator, assignee or member; the owner
 * or a participant of the card's sprint; a manager of its linked Key Result;
 * ADMIN / EXECUTIVE / DEPARTMENT_LEAD; or DB-RBAC `todo:write` with the card
 * inside the actor's record scope. Client-portal sessions: never.
 *
 * Returns false for a card that does not exist. Closed-sprint state is NOT part
 * of this rule — it is a separate 409 (see `todoWriteGuard`).
 */
export async function canWriteTodo(
  actor: TodoActor,
  todoOrId: string | TodoWriteSubject,
): Promise<boolean> {
  if (actor.userType === 'CLIENT_PORTAL') return false
  const todo = typeof todoOrId === 'string' ? await loadWriteSubject(todoOrId) : todoOrId
  if (!todo) return false

  const facts: Omit<TodoWriteFacts, 'rbacScopedWrite'> = {
    role: actor.role,
    isParticipant: hasTodoParticipantWriteAccess(actor.id, {
      assigneeId: todo.assigneeId,
      creatorId: todo.creatorId,
      memberIds: todo.members.map((m) => m.userId),
    }),
    isSprintMember: false,
    managesLinkedKr: false,
  }
  if (legacyTodoWriteVerdict(facts)) return true

  const sprint = await resolveTodoSprint(todo)
  facts.isSprintMember = !!sprint && isSprintMember(actor.id, sprint)
  if (legacyTodoWriteVerdict(facts)) return true

  const kr = todo.keyResult
  if (kr) {
    facts.managesLinkedKr = await canEditKeyResultWithObjectiveContext(
      actor.role as UserRole,
      actor.id,
      { ownerId: kr.ownerId, objectiveId: kr.objectiveId },
      {
        level: kr.objective.level,
        ownerId: kr.objective.ownerId,
        departmentId: kr.objective.departmentId,
      },
    )
  }

  // Legacy access is sufficient on its own; RBAC is only consulted to expand it.
  if (legacyTodoWriteVerdict(facts)) return true

  let rbacScopedWrite: boolean | null = null
  try {
    rbacScopedWrite = await resolveDocTypePermission(actor.id, 'todo', 'write')
    if (rbacScopedWrite) {
      const scopeFilter = await buildScopeFilter(actor.id, 'todo', 'write')
      if (scopeFilter) {
        const scopedTodo = await prisma.todo.findFirst({
          where: { id: todo.id, AND: [scopeFilter] },
          select: { id: true },
        })
        rbacScopedWrite = scopedTodo !== null
      }
    }
  } catch {
    // Keep legacy access only while a deployment is still applying RBAC tables.
    rbacScopedWrite = null
  }

  return todoWriteVerdict({ ...facts, rbacScopedWrite })
}

// ---------------------------------------------------------------------------
// Read rule
// ---------------------------------------------------------------------------

/** Roles that may read any card. */
export const TODO_READ_ALL_ROLES: readonly string[] = ['ADMIN', 'EXECUTIVE']

/** The actor for the read rule; `userType` lets client-portal sessions be refused. */
export type TodoReadActor = TodoActor

/**
 * The facts the read decision depends on, gathered lazily by `canReadTodo`
 * (cheap facts first; the loader stops as soon as the verdict is true).
 */
export interface TodoReadFacts {
  role: string
  /** Client-portal sessions never see internal cards (overrides everything). */
  isClientPortal: boolean
  /** Assignee, creator or explicit member of the card. */
  isParticipant: boolean
  /**
   * Watching the card (receives its notifications, so must be able to open it).
   * READ only — a watch never grants write (lib/apply-scope.ts `is_participant`
   * treats watchers the same way). `POST /api/watchers` only lets someone who
   * can already read a card watch it.
   */
  isWatcher: boolean
  /**
   * The card matches the actor's `todos` or `work` surface rule
   * (lib/todos/visibility.ts, record scope included) — whatever a list shows,
   * the modal can open.
   */
  onVisibilitySurface: boolean
  /** `canWriteTodo` — anyone who may change the card may read it. */
  canWrite: boolean
  /**
   * The card belongs to a sprint. Decides which of the two facts below applies:
   * a sprint card opens to its board's viewers, a non-sprint card to its OKR's.
   * `canReadTodo` always sets it; when absent, each fact counts on its own.
   */
  inSprint?: boolean
  /** Sprint card: the actor may view its sprint (`canViewSprint`: invite-only). */
  canViewLinkedSprint: boolean
  /** Non-sprint card: the linked KR (or objective) is viewable *without redaction*. */
  canViewLinkedOkr: boolean
}

/**
 * Card read rule (CPM-2 + decision 3, 2026-09-25):
 *   - ADMIN / EXECUTIVE, and anyone who may write the card (`canWriteTodo`);
 *   - its participants (assignee, creator, members) and watchers;
 *   - anyone whose `todos`/`work` list shows it (`todoVisibilityWhere`);
 *   - a card IN a sprint: anyone who can view that sprint (invite-only) — the
 *     linked OKR does not open a sprint card to people who are not on the board;
 *   - a card NOT in a sprint: anyone who can view its linked KR / objective
 *     without redaction.
 * Client-portal sessions: never.
 */
export function todoReadVerdict(facts: TodoReadFacts): boolean {
  if (facts.isClientPortal) return false
  if (
    TODO_READ_ALL_ROLES.includes(facts.role) ||
    facts.isParticipant ||
    facts.isWatcher ||
    facts.onVisibilitySurface ||
    facts.canWrite
  ) {
    return true
  }
  if (facts.canViewLinkedSprint && facts.inSprint !== false) return true
  if (facts.canViewLinkedOkr && facts.inSprint !== true) return true
  return false
}

/**
 * `{ id, OR: [surface rules] }` — the unified list-visibility rule evaluated for
 * one card, so the single-card read never re-implements the list rules. A
 * surface where of `{}` (unrestricted) matches the card on its own.
 *
 * This is the SQL-expressible arm of the read rule (list ⊆ read). The OKR arm
 * (`canViewKeyResult`/`canViewObjective` with redaction, manager chains) and the
 * write arm (KR managers, DB-RBAC write scope) are evaluated in code by
 * `canReadTodo`, which is the authority.
 */
export function readableTodoWhere(
  todoId: string,
  surfaceWheres: Prisma.TodoWhereInput[],
): Prisma.TodoWhereInput {
  return { AND: [{ id: todoId }, { OR: surfaceWheres }] }
}

/** The card fields the read rule reads (a superset of the write subject). */
export interface TodoReadSubject extends TodoWriteSubject {
  objective: {
    level: string
    ownerId: string
    departmentId: string | null
    isPrivate: boolean
    status: string
  } | null
  keyResult: (NonNullable<TodoWriteSubject['keyResult']> & { isPrivate: boolean; status: string }) | null
  sprint: TodoSprintAccess | null
}

const TODO_READ_SELECT = {
  id: true,
  assigneeId: true,
  creatorId: true,
  sprintId: true,
  members: { select: { userId: true } },
  keyResult: {
    select: {
      ownerId: true,
      objectiveId: true,
      isPrivate: true,
      status: true,
      objective: { select: { level: true, ownerId: true, departmentId: true } },
    },
  },
  objective: {
    select: { level: true, ownerId: true, departmentId: true, isPrivate: true, status: true },
  },
  sprint: SPRINT_ACCESS_SELECT,
} as const

async function loadReadSubject(todoId: string): Promise<TodoReadSubject | null> {
  return prisma.todo.findUnique({ where: { id: todoId }, select: TODO_READ_SELECT })
}

/** Linked KR (preferred) or objective, visible to the actor without redaction. */
async function canViewLinkedOkrUnredacted(actor: TodoActor, todo: TodoReadSubject): Promise<boolean> {
  const role = actor.role as UserRole
  const kr = todo.keyResult
  if (kr) {
    if (kr.status === 'DELETED') return false
    const v = await canViewKeyResult(role, actor.id, {
      ownerId: kr.ownerId,
      objectiveId: kr.objectiveId,
      isPrivate: kr.isPrivate,
    })
    return v.canView && !v.isRedacted
  }
  const obj = todo.objective
  if (obj) {
    if (obj.status === 'DELETED') return false
    const v = await canViewObjective(role, actor.id, {
      level: obj.level,
      ownerId: obj.ownerId,
      departmentId: obj.departmentId,
      isPrivate: obj.isPrivate,
    })
    return v.canView && !v.isRedacted
  }
  return false
}

/** Whether the card matches the actor's `todos` or `work` surface rule (incl. record scope). */
async function isOnVisibilitySurface(actor: TodoReadActor, todoId: string): Promise<boolean> {
  try {
    // One record-scope lookup shared by both surfaces.
    let scope: Promise<Record<string, unknown> | null> | undefined
    const scopeFilter: ScopeFilterFn = (userId, doctypeKey) => (scope ??= buildScopeFilter(userId, doctypeKey))
    const user = { id: actor.id, role: actor.role, userType: actor.userType ?? null }
    const wheres = await Promise.all([
      todoVisibilityWhere(user, 'todos', scopeFilter),
      todoVisibilityWhere(user, 'work', scopeFilter),
    ])
    const hit = await prisma.todo.findFirst({ where: readableTodoWhere(todoId, wheres), select: { id: true } })
    return hit !== null
  } catch {
    // RBAC tables not yet migrated — the surface rule cannot be evaluated, so it
    // grants nothing here (the explicit participant checks still apply).
    return false
  }
}

/**
 * Whether `actor` may read the card — see `todoReadVerdict` for the rule.
 * Facts are gathered cheapest first and the loader stops at the first grant.
 * Returns false for a card that does not exist, so callers answer 404 for both
 * (no id probing).
 */
export async function canReadTodo(
  actor: TodoReadActor,
  todoOrId: string | TodoReadSubject,
): Promise<boolean> {
  if (actor.userType === 'CLIENT_PORTAL') return false
  const todo = typeof todoOrId === 'string' ? await loadReadSubject(todoOrId) : todoOrId
  if (!todo) return false

  const facts: TodoReadFacts = {
    role: actor.role,
    isClientPortal: false,
    isParticipant: hasTodoParticipantWriteAccess(actor.id, {
      assigneeId: todo.assigneeId,
      creatorId: todo.creatorId,
      memberIds: todo.members.map((m) => m.userId),
    }),
    isWatcher: false,
    onVisibilitySurface: false,
    canWrite: false,
    inSprint: todo.sprint !== null,
    canViewLinkedSprint: false,
    canViewLinkedOkr: false,
  }
  if (todoReadVerdict(facts)) return true

  facts.isWatcher =
    (await prisma.watcher.findFirst({
      where: { userId: actor.id, entityType: 'TODO', entityId: todo.id },
      select: { id: true },
    })) !== null
  if (todoReadVerdict(facts)) return true

  if (todo.sprint) {
    facts.canViewLinkedSprint = await canViewSprint(actor.role as UserRole, actor.id, todo.sprint, {
      userType: actor.userType,
    })
    if (todoReadVerdict(facts)) return true
  }

  facts.onVisibilitySurface = await isOnVisibilitySurface(actor, todo.id)
  if (todoReadVerdict(facts)) return true

  if (!todo.sprint) {
    facts.canViewLinkedOkr = await canViewLinkedOkrUnredacted(actor, todo)
    if (todoReadVerdict(facts)) return true
  }

  facts.canWrite = await canWriteTodo(actor, todo)
  return todoReadVerdict(facts)
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

/**
 * Read guard for card sub-resources: 404 (never 403) when the card is missing
 * or the caller may not read it, so card ids cannot be probed. Null = proceed.
 */
export async function todoReadGuard(
  todoId: string,
  actor: TodoReadActor,
  notFoundMessage = 'To-do not found',
) {
  if (!(await canReadTodo(actor, todoId))) return apiNotFound(notFoundMessage)
  return null
}

/**
 * Combined guard for card mutations (checklists, items, labels, members,
 * comments, attachments): 404 when the card is missing or the caller cannot
 * even read it, 403 without `canWriteTodo`, 409 SPRINT_CLOSED when the card
 * sits in a COMPLETED/CANCELLED sprint.
 *
 * Returns an error response to return verbatim, or null when the caller may
 * proceed — the same contract as `sprintEditGuard` in lib/sprints/guards.ts.
 */
export async function todoWriteGuard(
  todoId: string,
  actor: TodoActor,
  forbiddenMessage = 'Insufficient permissions to update this to-do',
) {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: TODO_WRITE_SELECT,
  })
  if (!todo) return apiNotFound('To-do not found')

  if (!(await canWriteTodo(actor, todo))) {
    // Someone who cannot see the card learns nothing about whether it exists.
    if (!(await canReadTodo(actor, todoId))) return apiNotFound('To-do not found')
    return apiForbidden(forbiddenMessage)
  }

  if (isClosedSprintState(todo.sprint?.state)) {
    return apiError('This sprint is closed and read-only', { status: 409, code: 'SPRINT_CLOSED' })
  }

  return null
}

/**
 * Closed-sprint half of `todoWriteGuard`, on its own, for callers that have
 * already applied the access rule some other way (e.g. the generic
 * comment-attachment upload). The card is read-only once its sprint is
 * COMPLETED/CANCELLED (CDM-11 / STA-7).
 *
 * 404 when the card is missing, 409 SPRINT_CLOSED when its sprint is closed,
 * otherwise null (proceed). Call it after the access gate.
 */
export async function sprintClosedGuard(todoId: string) {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: { sprint: { select: { state: true } } },
  })
  if (!todo) return apiNotFound('To-do not found')

  if (isClosedSprintState(todo.sprint?.state)) {
    return apiError('This sprint is closed and read-only', { status: 409, code: 'SPRINT_CLOSED' })
  }

  return null
}
