/**
 * `okr.query` — read internal OKR / delivery data as the automation's owner.
 * Spec: docs/AI_Automations_Requirements_v1.0.md §7 (Tier 0).
 *
 * The non-negotiable rule (§3.4): results are scoped to what the OWNER can
 * already see. A requested scope is clamped down to the owner's role, private
 * records belonging to other people are excluded, and adding a recipient to the
 * automation never widens any of it.
 */

import { prisma } from '@/lib/prisma'
import type { OkrQueryEntity, OkrQueryScope } from '@/types/automations'
import type { AutomationTool, ToolContext, ToolResult, ToolRow } from './types'

const DEFAULT_LIMIT = 100

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

export const okrQueryTool: AutomationTool = {
  id: 'okr.query',

  async execute(rawParams, ctx): Promise<ToolResult> {
    const params = rawParams as unknown as QueryParams
    const scope = effectiveScope(params.scope, ctx.actor.role)
    const limit = Math.min(params.limit ?? DEFAULT_LIMIT, 500)
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

/**
 * Ownership predicate shared by Objective and KeyResult. Private records are
 * visible only to their owner regardless of scope — matching lib/permissions.ts.
 */
function okrScopeWhere(ctx: ToolContext, scope: OkrQueryScope, departmentField: 'departmentId' | null) {
  const { userId, departmentIds } = ctx.actor
  if (scope === 'OWNER') return { ownerId: userId }
  if (scope === 'DEPARTMENT' && departmentField && departmentIds.length > 0) {
    return {
      OR: [
        { ownerId: userId },
        { [departmentField]: { in: departmentIds }, isPrivate: false },
      ],
    }
  }
  if (scope === 'DEPARTMENT') return { ownerId: userId }
  return { OR: [{ ownerId: userId }, { isPrivate: false }] }
}

async function queryObjectives(
  params: QueryParams,
  ctx: ToolContext,
  scope: OkrQueryScope,
  limit: number,
  updatedSince: Date | undefined
): Promise<ToolRow[]> {
  const objectives = await prisma.objective.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : 'ACTIVE',
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...(params.confidence?.length ? { goalStatus: { in: params.confidence } } : {}),
      ...okrScopeWhere(ctx, scope, 'departmentId'),
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
  const keyResults = await prisma.keyResult.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : 'ACTIVE',
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...(params.confidence?.length ? { confidence: { in: params.confidence } } : {}),
      ...okrScopeWhere(ctx, scope, null),
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
  const { userId } = ctx.actor
  const todos = await prisma.todo.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : { notIn: ['COMPLETED', 'CANCELLED'] },
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...(scope === 'OWNER' ? { OR: [{ assigneeId: userId }, { creatorId: userId }] } : {}),
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
  const projects = await prisma.project.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : { notIn: ['COMPLETED', 'CANCELLED'] },
      ...(updatedSince ? { updatedAt: { gte: updatedSince } } : {}),
      ...(scope === 'OWNER' ? { projectManagerId: ctx.actor.userId } : {}),
      ...(scope === 'DEPARTMENT' && ctx.actor.departmentIds.length
        ? { OR: [{ projectManagerId: ctx.actor.userId }, { departmentId: { in: ctx.actor.departmentIds } }] }
        : {}),
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
  const risks = await prisma.risk.findMany({
    where: {
      status: params.statuses?.length ? { in: params.statuses } : { in: ['OPEN', 'MITIGATING'] },
      ...(scope === 'OWNER' ? { reporterId: ctx.actor.userId } : {}),
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
  const sprints = await prisma.sprint.findMany({
    where: {
      state: params.statuses?.length ? { in: params.statuses } : { in: ['PLANNING', 'ACTIVE'] },
      ...(scope === 'OWNER' ? { ownerId: ctx.actor.userId } : {}),
      ...(scope === 'DEPARTMENT' && ctx.actor.departmentIds.length
        ? { OR: [{ ownerId: ctx.actor.userId }, { departmentId: { in: ctx.actor.departmentIds } }] }
        : {}),
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
