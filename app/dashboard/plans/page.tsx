import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import PlansList, { type PlanRow } from '@/components/plans/PlansList'

/**
 * Tability-style plans list. A "plan" here is an Objective. The page returns
 * one row per objective with aggregate KR/initiative counts so the client view
 * can render densely without N+1 fetches.
 */
export default async function PlansListPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  // Role-based scoping mirrors the existing dashboard logic.
  const role = session.user.role
  let where: any = { status: { in: ['ACTIVE', 'ARCHIVED'] } }
  if (role === 'EMPLOYEE') {
    where = { ...where, ownerId: session.user.id }
  } else if (role === 'DEPARTMENT_LEAD') {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    where = {
      ...where,
      OR: [
        { ownerId: session.user.id },
        { departmentId: { in: memberships.map((m) => m.departmentId) } },
      ],
    }
  }

  const objectives = await prisma.objective.findMany({
    where,
    include: {
      timeframe: true,
      owner: { select: { id: true, name: true, avatar: true } },
      department: { select: { id: true, name: true } },
      keyResults: {
        where: { status: 'ACTIVE' },
        select: { id: true, progress: true, confidence: true },
      },
      _count: { select: { keyResults: true, childObjectives: true } },
    },
    orderBy: [{ level: 'asc' }, { updatedAt: 'desc' }],
  })

  // Initiative counts per objective in one shot via grouped query.
  const objectiveIds = objectives.map((o) => o.id)
  const initiativeRows = objectiveIds.length
    ? await prisma.todo.groupBy({
        by: ['keyResultId'],
        where: {
          keyResult: { objective: { id: { in: objectiveIds } } },
        },
        _count: { _all: true },
      })
    : []
  // Map keyResultId -> initiative count, then per objective sum.
  // Standalone todos (keyResultId = null) don't roll up to a plan; skip them.
  const krIdToInitiativeCount = new Map<string, number>()
  for (const row of initiativeRows) {
    if (row.keyResultId) krIdToInitiativeCount.set(row.keyResultId, row._count._all)
  }

  // Closed initiatives per objective (status COMPLETED).
  const closedInitiativeRows = objectiveIds.length
    ? await prisma.todo.groupBy({
        by: ['keyResultId'],
        where: {
          status: 'COMPLETED',
          keyResult: { objective: { id: { in: objectiveIds } } },
        },
        _count: { _all: true },
      })
    : []
  const krIdToClosed = new Map<string, number>()
  for (const row of closedInitiativeRows) {
    if (row.keyResultId) krIdToClosed.set(row.keyResultId, row._count._all)
  }

  // We also need keyResultId -> objectiveId so we can roll up per-objective.
  const krIdToObjectiveId = new Map<string, string>()
  for (const o of objectives) {
    for (const kr of o.keyResults) {
      krIdToObjectiveId.set(kr.id, o.id)
    }
  }

  const initiativesByObjective = new Map<string, { total: number; closed: number }>()
  for (const o of objectives) {
    initiativesByObjective.set(o.id, { total: 0, closed: 0 })
  }
  Array.from(krIdToInitiativeCount.entries()).forEach(([krId, total]) => {
    const objId = krIdToObjectiveId.get(krId)
    if (!objId) return
    const acc = initiativesByObjective.get(objId)
    if (acc) acc.total += total
  })
  Array.from(krIdToClosed.entries()).forEach(([krId, closed]) => {
    const objId = krIdToObjectiveId.get(krId)
    if (!objId) return
    const acc = initiativesByObjective.get(objId)
    if (acc) acc.closed += closed
  })

  const rows: PlanRow[] = objectives.map((o) => {
    const krs = o.keyResults
    const completedKrs = krs.filter((kr) => kr.progress >= 100).length
    const ncs = avgNcs(krs)
    const init = initiativesByObjective.get(o.id) ?? { total: 0, closed: 0 }
    return {
      id: o.id,
      title: o.title,
      level: o.level,
      ownerName: o.owner.name,
      ownerAvatar: o.owner.avatar,
      timeframeId: o.timeframeId,
      timeframeName: o.timeframe.name,
      timeframeStart: o.timeframe.startDate.toISOString(),
      timeframeEnd: o.timeframe.endDate.toISOString(),
      department: o.department?.name ?? null,
      keyResultsTotal: o._count.keyResults,
      keyResultsCompleted: completedKrs,
      keyResultsProgressPct: krs.length === 0 ? 0 : Math.round(krs.reduce((s, kr) => s + (kr.progress || 0), 0) / krs.length),
      initiativesTotal: init.total,
      initiativesClosed: init.closed,
      ncs,
      goalStatus: o.goalStatus,
      status: o.status,
      childCount: o._count.childObjectives,
    }
  })

  return <PlansList rows={rows} currentUserId={session.user.id} />
}

function avgNcs(krs: { confidence: string; progress: number }[]): number {
  if (krs.length === 0) return 0
  let sum = 0
  for (const kr of krs) {
    if (kr.confidence === 'ON_TRACK') sum += 100
    else if (kr.confidence === 'AT_RISK') sum += 50
    else if (kr.confidence === 'OFF_TRACK') sum += 0
    else sum += 50
  }
  return Math.round(sum / krs.length)
}
