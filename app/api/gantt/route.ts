import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

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

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const timeframeId = searchParams.get('timeframeId')

  const role = session.user.role
  const where: any = { status: 'ACTIVE' }
  if (role === 'EMPLOYEE') {
    where.ownerId = session.user.id
  } else if (role === 'DEPARTMENT_LEAD') {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    where.OR = [
      { ownerId: session.user.id },
      { departmentId: { in: memberships.map((m) => m.departmentId) } },
    ]
  }
  if (timeframeId) where.timeframeId = timeframeId

  const objectives = await prisma.objective.findMany({
    where,
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

    tasks.push({
      id: `obj_${o.id}`,
      text: o.title,
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
      tasks.push({
        id: `kr_${kr.id}`,
        text: kr.title,
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
        unit: kr.unit,
        currentValue: kr.currentValue,
        targetValue: kr.targetValue,
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
