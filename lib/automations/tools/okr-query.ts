/**
 * `okr.query` — read internal OKR / delivery data as the automation's owner.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §7 (Tier 0).
 *
 * The non-negotiable rule (§3.4): results are scoped to what the OWNER can
 * already see. A requested scope is clamped down to the owner's role, private
 * records belonging to other people are excluded, and adding a recipient to the
 * automation never widens any of it.
 *
 * How that rule is actually enforced here: every entity has a *pure* where
 * builder below (`objectiveScopeWhere`, `todoScopeWhere`, …). They are the only
 * place a Prisma filter is produced, they re-clamp the requested scope against
 * the actor's role themselves (so no caller can pass an unclamped scope), and
 * `scopeWhereFor` refuses to hand back an empty predicate for anyone who is not
 * an ADMIN/EXECUTIVE reading at ORG — it falls back to OWNER instead. An
 * automation must never be a privilege-escalation path around lib/permissions.ts.
 */

import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { OkrQueryEntity, OkrQueryScope } from '@/types/automations'
import type { AutomationTool, ToolActor, ToolContext, ToolResult, ToolRow } from './types'

/**
 * Database seam. Production always uses the shared client; unit tests swap in a
 * stub so the generated `where` clauses — the thing the §3.4 invariant actually
 * rests on — can be asserted without a database. Typed as `PrismaClient`, so
 * every query below is still checked against the real schema.
 */
let db: PrismaClient = prisma

/** Test-only. Pass `null` to restore the shared client. */
export function __setOkrQueryDb(next: PrismaClient | null): void {
  db = next ?? prisma
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

/**
 * Clamp the requested scope to what the role actually permits. Asking for ORG as
 * an EMPLOYEE silently narrows to OWNER rather than erroring — the plan stays
 * portable when an owner's role changes.
 */
export function effectiveScope(requested: OkrQueryScope | undefined, role: string): OkrQueryScope {
  const ceiling: OkrQueryScope =
    role === 'ADMIN' || role === 'EXECUTIVE' ? 'ORG'
    : role === 'DEPARTMENT_LEAD' ? 'DEPARTMENT'
    : 'OWNER'

  const order: OkrQueryScope[] = ['OWNER', 'DEPARTMENT', 'ORG']
  const wanted = requested ?? 'OWNER'
  return order.indexOf(wanted) <= order.indexOf(ceiling) ? wanted : ceiling
}

/** Roles that already see every record interactively (lib/permissions.ts, lib/rbac.ts). */
function isOrgWideRole(role: string): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE'
}

/** A row cap the caller cannot turn into "unbounded" or into Prisma's negative-take reverse cursor. */
export function effectiveLimit(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return DEFAULT_LIMIT
  return Math.min(Math.max(1, Math.floor(requested)), MAX_LIMIT)
}

function cutoff(now: Date, days: number | undefined): Date | undefined {
  return days === undefined ? undefined : new Date(now.getTime() - days * 86_400_000)
}

function fmtDate(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString().slice(0, 10) : undefined
}

interface QueryParams {
  entities: OkrQueryEntity[]
  scope?: OkrQueryScope
  updatedWithinDays?: number
  staleForDays?: number
  statuses?: string[]
  confidence?: string[]
  limit?: number
}

// ---------------------------------------------------------------------------
// Scope predicates — pure, exported, and unit-tested in okr-query.test.ts
// ---------------------------------------------------------------------------

/** The identity a scope predicate is built for. Structurally a `ToolActor`. */
export type ScopeActor = Pick<ToolActor, 'userId' | 'departmentIds'> & { role: string }

export type ScopeWhere = Record<string, unknown>
export type ScopeWhereBuilder = (actor: ScopeActor, requested: OkrQueryScope | undefined) => ScopeWhere

/** `{ OR: [...] }`, collapsed to the single arm when there is only one. */
function anyOf(arms: ScopeWhere[]): ScopeWhere {
  return arms.length === 1 ? arms[0] : { OR: arms }
}

/**
 * Objective. Mirrors `canViewObjective`: you always see your own; a department
 * member sees non-private objectives of their departments; at ORG nobody gets
 * somebody else's private objective (interactively those come back redacted,
 * and a redacted row must not be flattened into a briefing).
 */
export const objectiveScopeWhere: ScopeWhereBuilder = (actor, requested) => {
  const scope = effectiveScope(requested, actor.role)
  const mine: ScopeWhere = { ownerId: actor.userId }
  if (scope === 'OWNER') return mine
  if (scope === 'DEPARTMENT') {
    if (actor.departmentIds.length === 0) return mine
    return anyOf([mine, { departmentId: { in: actor.departmentIds }, isPrivate: false }])
  }
  return anyOf([mine, { isPrivate: false }])
}

/**
 * Key result. It has no departmentId of its own, but it always has a parent
 * objective — and `canViewKeyResult` resolves visibility through that parent,
 * so the department predicate is expressed on the relation rather than failing
 * closed to OWNER. Both the KR and its objective must be non-private.
 */
export const keyResultScopeWhere: ScopeWhereBuilder = (actor, requested) => {
  const scope = effectiveScope(requested, actor.role)
  const mine: ScopeWhere = { ownerId: actor.userId }
  if (scope === 'OWNER') return mine
  if (scope === 'DEPARTMENT') {
    if (actor.departmentIds.length === 0) return mine
    return anyOf([
      mine,
      { isPrivate: false, objective: { departmentId: { in: actor.departmentIds }, isPrivate: false } },
    ])
  }
  return anyOf([mine, { isPrivate: false, objective: { isPrivate: false } }])
}

/**
 * Todo. There is no departmentId and no isPrivate column, so ownership is
 * expressed exactly as the interactive list expresses it
 * (app/api/todos/route.ts: `assigneeId = me OR creatorId = me`) plus the
 * surfaces a department member can already open: the initiative list of a
 * non-private objective/KR in their department, and the board of a department
 * sprint (`canViewSprint`). A loose personal todo of a colleague — no
 * objective, no KR, no sprint — has no visibility marker at all and is
 * therefore never returned to anybody but its assignee/creator.
 */
export const todoScopeWhere: ScopeWhereBuilder = (actor, requested) => {
  const scope = effectiveScope(requested, actor.role)
  const mine: ScopeWhere[] = [{ assigneeId: actor.userId }, { creatorId: actor.userId }]
  if (scope === 'OWNER') return anyOf(mine)
  if (scope === 'DEPARTMENT') {
    if (actor.departmentIds.length === 0) return anyOf(mine)
    const dept = { in: actor.departmentIds }
    return anyOf([
      ...mine,
      { objective: { departmentId: dept, isPrivate: false } },
      { keyResult: { isPrivate: false, objective: { departmentId: dept, isPrivate: false } } },
      { sprint: { departmentId: dept } },
    ])
  }
  return anyOf([
    ...mine,
    { objective: { isPrivate: false } },
    { keyResult: { isPrivate: false, objective: { isPrivate: false } } },
    { sprintId: { not: null } },
  ])
}

/**
 * Risk. `reporterId` is the only direct user link, but a risk is always read in
 * the context of its parent (app/api/risks GET requires objectiveId or
 * keyResultId), so visibility is inherited from that parent exactly like a KR's
 * is. A risk with neither parent is visible only to the person who filed it.
 */
export const riskScopeWhere: ScopeWhereBuilder = (actor, requested) => {
  const scope = effectiveScope(requested, actor.role)
  const mine: ScopeWhere[] = [
    { reporterId: actor.userId },
    { objective: { ownerId: actor.userId } },
    { keyResult: { ownerId: actor.userId } },
  ]
  if (scope === 'OWNER') return anyOf(mine)
  if (scope === 'DEPARTMENT') {
    if (actor.departmentIds.length === 0) return anyOf(mine)
    const dept = { in: actor.departmentIds }
    return anyOf([
      ...mine,
      { objective: { departmentId: dept, isPrivate: false } },
      { keyResult: { isPrivate: false, objective: { departmentId: dept, isPrivate: false } } },
    ])
  }
  return anyOf([
    ...mine,
    { objective: { isPrivate: false } },
    { keyResult: { isPrivate: false, objective: { isPrivate: false } } },
  ])
}

/**
 * Project. Mirrors app/api/projects/route.ts one-for-one: ADMIN/EXECUTIVE see
 * the portfolio, everybody else sees what they manage, what their department
 * owns, or what they are a member of. An actor with no department membership
 * falls back to the OWNER predicate instead of dropping the filter.
 */
export const projectScopeWhere: ScopeWhereBuilder = (actor, requested) => {
  const scope = effectiveScope(requested, actor.role)
  const mine: ScopeWhere[] = [
    { projectManagerId: actor.userId },
    { members: { some: { userId: actor.userId } } },
  ]
  if (scope === 'ORG') return {}
  if (scope === 'DEPARTMENT' && actor.departmentIds.length > 0) {
    return anyOf([...mine, { departmentId: { in: actor.departmentIds } }])
  }
  return anyOf(mine)
}

/**
 * Sprint. Mirrors `canViewSprint`: ADMIN/EXECUTIVE any, otherwise owner,
 * participant, or a sprint scoped to one of the actor's departments.
 */
export const sprintScopeWhere: ScopeWhereBuilder = (actor, requested) => {
  const scope = effectiveScope(requested, actor.role)
  const mine: ScopeWhere[] = [
    { ownerId: actor.userId },
    { participants: { some: { userId: actor.userId } } },
  ]
  if (scope === 'ORG') return {}
  if (scope === 'DEPARTMENT' && actor.departmentIds.length > 0) {
    return anyOf([...mine, { departmentId: { in: actor.departmentIds } }])
  }
  return anyOf(mine)
}

/**
 * Every entity in OKR_QUERY_ENTITIES must have a builder here. Adding an entity
 * to the union without adding a predicate is a compile error, and the unit test
 * additionally asserts the generated predicate is never empty for a non-org-wide
 * actor.
 */
export const SCOPE_WHERE_BUILDERS: Record<OkrQueryEntity, ScopeWhereBuilder> = {
  objectives: objectiveScopeWhere,
  keyResults: keyResultScopeWhere,
  todos: todoScopeWhere,
  projects: projectScopeWhere,
  risks: riskScopeWhere,
  sprints: sprintScopeWhere,
}

/**
 * The only entry point the queries below use. Fails closed: if a builder ever
 * produces an empty predicate for someone who is not reading org-wide by right,
 * the query is narrowed to OWNER rather than reading the whole table.
 */
export function scopeWhereFor(
  entity: OkrQueryEntity,
  actor: ScopeActor,
  requested: OkrQueryScope | undefined
): ScopeWhere {
  const build = SCOPE_WHERE_BUILDERS[entity]
  const where = build(actor, requested)
  const orgWide = effectiveScope(requested, actor.role) === 'ORG' && isOrgWideRole(actor.role)
  if (!isEmpty(where) || orgWide) return where

  // A builder produced no predicate for someone who is not entitled to an
  // org-wide read. Narrow to OWNER; if even that is empty the predicate cannot
  // be expressed safely, so refuse rather than read the whole table.
  const ownOnly = build(actor, 'OWNER')
  if (isEmpty(ownOnly)) {
    throw new Error(`okr.query: refusing to read ${entity} without an ownership predicate`)
  }
  return ownOnly
}

function isEmpty(where: ScopeWhere): boolean {
  return Object.keys(where).length === 0
}

export const okrQueryTool: AutomationTool = {
  id: 'okr.query',

  async execute(rawParams, ctx): Promise<ToolResult> {
    const params = rawParams as unknown as QueryParams
    const scope = effectiveScope(params.scope, ctx.actor.role)
    const limit = effectiveLimit(params.limit)
    const updatedSince = cutoff(ctx.now, params.updatedWithinDays)
    const staleBefore = cutoff(ctx.now, params.staleForDays)

    const rows: ToolRow[] = []
    for (const entity of params.entities) {
      switch (entity) {
        case 'objectives':
          rows.push(...(await queryObjectives(params, ctx, scope, limit, updatedSince)))
          break
        case 'keyResults':
          rows.push(...(await queryKeyResults(params, ctx, scope, limit, updatedSince, staleBefore)))
          break
        case 'todos':
          rows.push(...(await queryTodos(params, ctx, scope, limit, updatedSince)))
          break
        case 'projects':
          rows.push(...(await queryProjects(params, ctx, scope, limit, updatedSince)))
          break
        case 'risks':
          rows.push(...(await queryRisks(params, ctx, scope, limit)))
          break
        case 'sprints':
          rows.push(...(await querySprints(params, ctx, scope, limit)))
          break
      }
    }

    const byKind = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.kind] = (acc[row.kind] ?? 0) + 1
      return acc
    }, {})
    const summary = Object.entries(byKind).map(([kind, count]) => `${count} ${kind}`).join(', ') || 'no rows'

    return { rows, summary: `${summary} (scope: ${scope})` }
  },
}

// ---------------------------------------------------------------------------
// Per-entity queries
// ---------------------------------------------------------------------------

async function queryObjectives(
  params: QueryParams,
  ctx: ToolContext,
  scope: OkrQueryScope,
  limit: number,
  updatedSince: Date | undefined
): Promise<ToolRow[]> {
  const objectives = await db.objective.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : 'ACTIVE',
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...(params.confidence?.length ? { goalStatus: { in: params.confidence } } : {}),
      ...scopeWhereFor('objectives', ctx.actor, scope),
    },
    select: {
      id: true, title: true, level: true, goalStatus: true, progress: true,
      confidence: true, endDate: true, updatedAt: true,
      owner: { select: { name: true } },
      timeframe: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  return objectives.map((o) => ({
    kind: 'objective',
    id: o.id,
    title: o.title,
    subtitle: o.timeframe?.name,
    status: o.goalStatus,
    owner: o.owner?.name,
    updatedAt: o.updatedAt.toISOString(),
    url: `/dashboard/objectives/${o.id}`,
    fields: {
      level: o.level,
      progress: `${Math.round(o.progress)}%`,
      confidence: String(o.confidence),
      ...(fmtDate(o.endDate) ? { endDate: fmtDate(o.endDate)! } : {}),
    },
  }))
}

async function queryKeyResults(
  params: QueryParams,
  ctx: ToolContext,
  scope: OkrQueryScope,
  limit: number,
  updatedSince: Date | undefined,
  staleBefore: Date | undefined
): Promise<ToolRow[]> {
  const keyResults = await db.keyResult.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : 'ACTIVE',
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...(params.confidence?.length ? { confidence: { in: params.confidence } } : {}),
      ...scopeWhereFor('keyResults', ctx.actor, scope),
    },
    select: {
      id: true, title: true, currentValue: true, targetValue: true, unit: true,
      confidence: true, progress: true, updatedAt: true,
      owner: { select: { name: true } },
      objective: { select: { id: true, title: true } },
      checkIns: { select: { asOfDate: true }, orderBy: { asOfDate: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  // "Stale" means no check-in since the cutoff — a KR edited for typos is still
  // stale if nobody has reported a number. Filtered in memory because the
  // latest-check-in comparison isn't expressible in a single Prisma where.
  const filtered = staleBefore
    ? keyResults.filter((kr) => {
        const latest = kr.checkIns[0]?.asOfDate
        return !latest || latest < staleBefore
      })
    : keyResults

  return filtered.map((kr) => ({
    kind: 'keyResult',
    id: kr.id,
    title: kr.title,
    subtitle: kr.objective?.title,
    status: kr.confidence,
    owner: kr.owner?.name,
    updatedAt: kr.updatedAt.toISOString(),
    url: `/dashboard/objectives/${kr.objective?.id ?? ''}`,
    fields: {
      progress: `${Math.round(kr.progress)}%`,
      current: `${kr.currentValue}${kr.unit}`,
      target: `${kr.targetValue}${kr.unit}`,
      lastCheckIn: fmtDate(kr.checkIns[0]?.asOfDate) ?? 'never',
    },
  }))
}

async function queryTodos(
  params: QueryParams,
  ctx: ToolContext,
  scope: OkrQueryScope,
  limit: number,
  updatedSince: Date | undefined
): Promise<ToolRow[]> {
  const todos = await db.todo.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : { notIn: ['COMPLETED', 'CANCELLED'] },
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...scopeWhereFor('todos', ctx.actor, scope),
    },
    select: {
      id: true, title: true, status: true, priority: true, dueDate: true, updatedAt: true,
      assignee: { select: { name: true } },
      keyResult: { select: { title: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    take: limit,
  })

  return todos.map((t) => ({
    kind: 'todo',
    id: t.id,
    title: t.title,
    subtitle: t.keyResult?.title,
    status: t.status,
    owner: t.assignee?.name,
    updatedAt: t.updatedAt.toISOString(),
    url: `/dashboard/todos?todo=${t.id}`,
    fields: {
      priority: t.priority,
      ...(fmtDate(t.dueDate) ? { dueDate: fmtDate(t.dueDate)! } : {}),
      ...(t.dueDate && t.dueDate < ctx.now ? { overdue: 'yes' } : {}),
    },
  }))
}

async function queryProjects(
  params: QueryParams,
  ctx: ToolContext,
  scope: OkrQueryScope,
  limit: number,
  updatedSince: Date | undefined
): Promise<ToolRow[]> {
  const projects = await db.project.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : { notIn: ['COMPLETED', 'CANCELLED'] },
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...scopeWhereFor('projects', ctx.actor, scope),
    },
    select: {
      id: true, code: true, name: true, status: true, ragStatus: true,
      percentComplete: true, percentPlanned: true, plannedEnd: true, updatedAt: true,
      clientName: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  return projects.map((p) => ({
    kind: 'project',
    id: p.id,
    title: `${p.code} — ${p.name}`,
    subtitle: p.clientName,
    status: p.ragStatus,
    updatedAt: p.updatedAt.toISOString(),
    url: `/dashboard/projects/${p.id}`,
    fields: {
      state: p.status,
      complete: `${Math.round(p.percentComplete)}%`,
      planned: `${Math.round(p.percentPlanned)}%`,
      variance: `${Math.round(p.percentComplete - p.percentPlanned)}pp`,
      ...(fmtDate(p.plannedEnd) ? { plannedEnd: fmtDate(p.plannedEnd)! } : {}),
    },
  }))
}

async function queryRisks(
  params: QueryParams,
  ctx: ToolContext,
  scope: OkrQueryScope,
  limit: number
): Promise<ToolRow[]> {
  const risks = await db.risk.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : { in: ['OPEN', 'MITIGATING'] },
      ...scopeWhereFor('risks', ctx.actor, scope),
    },
    select: {
      id: true, title: true, severity: true, status: true, updatedAt: true,
      reporter: { select: { name: true } },
      objective: { select: { id: true, title: true } },
      keyResult: { select: { title: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  return risks.map((r) => ({
    kind: 'risk',
    id: r.id,
    title: r.title,
    subtitle: r.objective?.title ?? r.keyResult?.title,
    status: r.status,
    owner: r.reporter?.name,
    updatedAt: r.updatedAt.toISOString(),
    url: r.objective?.id ? `/dashboard/objectives/${r.objective.id}` : '/dashboard',
    fields: { severity: r.severity },
  }))
}

async function querySprints(
  params: QueryParams,
  ctx: ToolContext,
  scope: OkrQueryScope,
  limit: number
): Promise<ToolRow[]> {
  const sprints = await db.sprint.findMany({
    where: {
      state: params.statuses?.length ? { in: params.statuses } : { in: ['PLANNING', 'ACTIVE'] },
      ...scopeWhereFor('sprints', ctx.actor, scope),
    },
    select: {
      id: true, name: true, state: true, startDate: true, endDate: true, goal: true, updatedAt: true,
      owner: { select: { name: true } },
      _count: { select: { todos: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  return sprints.map((s) => ({
    kind: 'sprint',
    id: s.id,
    title: s.name,
    subtitle: s.goal ?? undefined,
    status: s.state,
    owner: s.owner?.name,
    updatedAt: s.updatedAt.toISOString(),
    url: `/dashboard/sprints/${s.id}`,
    fields: {
      tasks: String(s._count.todos),
      ...(fmtDate(s.startDate) ? { startDate: fmtDate(s.startDate)! } : {}),
      ...(fmtDate(s.endDate) ? { endDate: fmtDate(s.endDate)! } : {}),
    },
  }))
}
