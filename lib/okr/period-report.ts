import { prisma } from '@/lib/prisma'

export interface PeriodReportActor { id: string; role: string }

const GRADE_BUCKETS = [
  { label: '0.0–0.2', min: 0, max: 0.2 },
  { label: '0.2–0.4', min: 0.2, max: 0.4 },
  { label: '0.4–0.6', min: 0.4, max: 0.6 },
  { label: '0.6–0.8', min: 0.6, max: 0.8 },
  { label: '0.8–1.0', min: 0.8, max: 1.001 },
]

export async function buildPeriodCloseReport(timeframeId: string, actor: PeriodReportActor) {
  if (!['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'].includes(actor.role)) return null
  const timeframe = await prisma.timeframe.findUnique({ where: { id: timeframeId } })
  if (!timeframe) return undefined

  const memberships = actor.role === 'DEPARTMENT_LEAD'
    ? await prisma.departmentMembership.findMany({ where: { userId: actor.id, endedAt: null }, select: { departmentId: true } })
    : []
  const departmentIds = memberships.map((membership) => membership.departmentId)
  if (actor.role === 'DEPARTMENT_LEAD' && departmentIds.length === 0) return null

  const objectives = await prisma.objective.findMany({
    where: { timeframeId, status: { not: 'DELETED' }, ...(departmentIds.length ? { departmentId: { in: departmentIds } } : {}) },
    include: {
      owner: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      retrospective: true,
      rolledTo: { select: { id: true, title: true, timeframe: { select: { name: true } } }, take: 1 },
      keyResults: {
        where: { status: { not: 'DELETED' } },
        include: {
          owner: { select: { id: true, name: true } },
          retrospective: true,
          rolledTo: { select: { id: true, title: true, objective: { select: { timeframe: { select: { name: true } } } } }, take: 1 },
        },
      },
    },
    orderBy: { title: 'asc' },
  })

  const keyResults = objectives.flatMap((objective) => objective.keyResults.map((kr) => ({ ...kr, department: objective.department })))
  const allOkrs = [
    ...objectives.map((entity) => ({ kind: 'OBJECTIVE' as const, entity })),
    ...keyResults.map((entity) => ({ kind: 'KEY_RESULT' as const, entity })),
  ]
  const closed = allOkrs.filter(({ entity }) => entity.closureStatus === 'CLOSED')
  const outcomeMix = ['ACHIEVED', 'PARTIAL', 'MISSED', 'ABANDONED'].map((outcome) => ({
    outcome,
    count: closed.filter(({ entity }) => entity.outcome === outcome).length,
  }))
  const grades = closed.map(({ entity }) => entity.finalGrade).filter((grade): grade is number => grade != null)
  const gradeHistogram = GRADE_BUCKETS.map((bucket, index) => ({
    label: bucket.label,
    count: grades.filter((grade) => grade >= bucket.min && (index === GRADE_BUCKETS.length - 1 ? grade <= 1 : grade < bucket.max)).length,
  }))
  const deltas = closed.map(({ entity }) => entity.gradeDelta).filter((delta): delta is number => delta != null)
  const blockerCounts = new Map<string, number>()
  const lessons: Array<{ id: string; kind: 'OBJECTIVE' | 'KEY_RESULT'; title: string; department: string; lesson: string }> = []
  for (const item of closed) {
    const retro = item.entity.retrospective
    if (retro?.primaryBlocker && retro.primaryBlocker !== 'NONE') blockerCounts.set(retro.primaryBlocker, (blockerCounts.get(retro.primaryBlocker) || 0) + 1)
    if (retro?.whatWeLearned) lessons.push({
      id: item.entity.id, kind: item.kind, title: item.entity.title,
      department: item.entity.department?.name || 'Organization', lesson: retro.whatWeLearned,
    })
  }

  return {
    timeframe: { ...timeframe, startDate: timeframe.startDate.toISOString(), endDate: timeframe.endDate.toISOString() },
    scope: departmentIds.length ? { type: 'DEPARTMENT', departmentIds } : { type: 'ORGANIZATION' },
    closeProgress: {
      closedObjectives: objectives.filter((o) => o.closureStatus === 'CLOSED').length,
      totalObjectives: objectives.length,
      closedKeyResults: keyResults.filter((kr) => kr.closureStatus === 'CLOSED').length,
      totalKeyResults: keyResults.length,
    },
    stillToClose: allOkrs.filter(({ entity }) => entity.closureStatus !== 'CLOSED').map(({ kind, entity }) => ({ id: entity.id, kind, title: entity.title, owner: entity.owner })),
    outcomeMix,
    gradeHistogram,
    averageGradeDelta: deltas.length ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null,
    blockers: [...blockerCounts.entries()].map(([blocker, count]) => ({ blocker, count })).sort((a, b) => b.count - a.count),
    lessons,
    rollForward: {
      rolled: closed.filter(({ entity }) => entity.rolledTo.length > 0).length,
      abandoned: closed.filter(({ entity }) => entity.outcome === 'ABANDONED').length,
      completed: closed.filter(({ entity }) => entity.outcome !== 'ABANDONED' && entity.rolledTo.length === 0).length,
    },
    objectives: objectives.map((objective) => ({
      id: objective.id, title: objective.title, owner: objective.owner, department: objective.department,
      closureStatus: objective.closureStatus, outcome: objective.outcome, finalGrade: objective.finalGrade,
      finalProgress: objective.finalProgress, gradeDelta: objective.gradeDelta, reopenCount: objective.reopenCount,
      rolledTo: objective.rolledTo[0] || null,
    })),
    closeQueue: [
      ...keyResults.filter((kr) => kr.ownerId === actor.id && kr.closureStatus !== 'CLOSED').map((kr) => ({ ...kr, kind: 'KEY_RESULT' as const })),
      ...objectives.filter((objective) => objective.ownerId === actor.id && objective.closureStatus !== 'CLOSED').map((objective) => ({ ...objective, kind: 'OBJECTIVE' as const })),
    ].map((entity) => ({
      id: entity.id, kind: entity.kind, title: entity.title, progress: entity.progress,
      closureStatus: entity.closureStatus, outcome: entity.outcome, finalGrade: entity.finalGrade, closureNote: entity.closureNote,
    })),
  }
}
