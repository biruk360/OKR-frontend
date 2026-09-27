import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import {
  buildObjectiveVisibilityWhere,
  canViewKeyResultInMemory,
  canViewObjectiveInMemory,
  loadViewerContext,
  REDACTED_KEY_RESULT_TITLE,
  REDACTED_OBJECTIVE_TITLE,
} from '@/lib/okr/visibility-scope'
import { ALL_TIMEFRAMES, resolveDefaultTimeframe } from '@/lib/okr/active-timeframe'

/**
 * Flattened shape tailored for DHTMLX Gantt. Objectives render as "project"
 * rows; key results render as child tasks under their owning objective.
 * Dependencies come from `parentObjectiveId` (alignment) so the chart
 * visualizes the objective hierarchy with arrows.
 */
export interface GanttTask {
  id: string
  text: string
  start_date: string
  end_date: string
  progress: number
  parent: string
  type: 'project' | 'task'
  open: boolean
  owner: string
  ownerAvatar: string | null
  level: string | null
  department: string | null
  goalStatus: string | null
  confidence: string | null
  unit: string | null
  currentValue: number | null
  targetValue: number | null
  entityType: 'objective' | 'keyresult'
  entityId: string
}

export interface GanttLink {
  id: string
  source: string
  target: string
  type: '0' | '1' | '2' | '3'
}

export interface GanttPayload {
  data: GanttTask[]
  links: GanttLink[]
}

/**
 * GET /api/gantt?timeframeId=<id|all>
 *
 * Scope: EMPLOYEE → own objectives; DEPARTMENT_LEAD → own + their departments';
 * ADMIN/EXECUTIVE → all. Always ANDed with the shared OKR visibility rule
 * (lib/okr/visibility-scope.ts: not DELETED, objective record scope) and private
 * objectives/KRs the viewer may only see redacted are returned redacted.
 * Without `timeframeId` the active timeframe is used (`timeframeId=all` → every
 * timeframe) — loading every timeframe by default was the endpoint's main cost.
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  if (session.user.userType === 'CLIENT_PORTAL') return apiForbidden('Forbidden')
  const { searchParams } = new URL(request.url)
  const requestedTimeframe = searchParams.get('timeframeId')

  const role = session.user.role
  const [ctx, defaultTimeframe] = await Promise.all([
    loadViewerContext({ id: session.user.id, role }),
    requestedTimeframe ? Promise.resolve(null) : resolveDefaultTimeframe(),
  ])
  const timeframeId =
    requestedTimeframe === ALL_TIMEFRAMES ? null : requestedTimeframe ?? defaultTimeframe?.id ?? null

  const filters: Prisma.ObjectiveWhereInput[] = [buildObjectiveVisibilityWhere(ctx), { status: 'ACTIVE' }]
  if (role === 'EMPLOYEE') {
    filters.push({ ownerId: session.user.id })
  } else if (role === 'DEPARTMENT_LEAD') {
    filters.push({
      OR: [
        { ownerId: session.user.id },
        { departmentId: { in: Array.from(ctx.departmentIds) } },
      ],
    })
  }
  if (timeframeId) filters.push({ timeframeId })

  const objectives = await prisma.objective.findMany({
    where: { AND: filters },
    orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      department: { select: { id: true, name: true } },
      timeframe: { select: { id: true, startDate: true, endDate: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  })

  const tasks: GanttTask[] = []
  const visibleObjectiveIds = new Set<string>()

  for (const o of objectives) {
    const start = o.startDate ?? o.timeframe?.startDate
    const end = o.endDate ?? o.timeframe?.endDate
    if (!start || !end) continue

    visibleObjectiveIds.add(o.id)
    const objVerdict = canViewObjectiveInMemory(ctx, o)

    tasks.push({
      id: `obj_${o.id}`,
      text: objVerdict.isRedacted ? REDACTED_OBJECTIVE_TITLE : o.title,
      start_date: formatDate(start),
      end_date: formatDate(end),
      progress: clamp01(o.progress / 100),
      parent: '0',
      type: 'project',
      open: true,
      owner: o.owner.name ?? '—',
      ownerAvatar: o.owner.avatar,
      level: o.level,
      department: o.department?.name ?? null,
      goalStatus: o.goalStatus,
      confidence: null,
      unit: null,
      currentValue: null,
      targetValue: null,
      entityType: 'objective',
      entityId: o.id,
    })

    for (const kr of o.keyResults) {
      const krRedacted = canViewKeyResultInMemory(ctx, kr, objVerdict).isRedacted
      tasks.push({
        id: `kr_${kr.id}`,
        text: krRedacted ? REDACTED_KEY_RESULT_TITLE : kr.title,
        start_date: formatDate(start),
        end_date: formatDate(end),
        progress: clamp01(kr.progress / 100),
        parent: `obj_${o.id}`,
        type: 'task',
        open: false,
        owner: kr.owner.name ?? '—',
        ownerAvatar: kr.owner.avatar,
        level: null,
        department: null,
        goalStatus: null,
        confidence: kr.confidence,
        unit: krRedacted ? '' : kr.unit,
        currentValue: krRedacted ? null : kr.currentValue,
        targetValue: krRedacted ? null : kr.targetValue,
        entityType: 'keyresult',
        entityId: kr.id,
      })
    }
  }

  const links: GanttLink[] = []
  for (const o of objectives) {
    if (!o.parentObjectiveId) continue
    if (!visibleObjectiveIds.has(o.id) || !visibleObjectiveIds.has(o.parentObjectiveId)) continue
    links.push({
      id: `lnk_${o.parentObjectiveId}_${o.id}`,
      source: `obj_${o.parentObjectiveId}`,
      target: `obj_${o.id}`,
      type: '0',
    })
  }

  const payload: GanttPayload = { data: tasks, links }
  return apiSuccess(payload)
})

function formatDate(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
