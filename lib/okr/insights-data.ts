/**
 * Server loaders for the Insights page (/dashboard/insights), moved out of the
 * retired app/dashboard/{analytics,progress,progress-report} pages with no
 * change to scoping or numbers:
 *
 *  - loadAnalyticsOverview  → Overview tab (was /dashboard/analytics)
 *  - loadProgressDashboard  → Progress tab, "Status dashboard" (was /dashboard/progress-report)
 *  - loadProgressTracking   → Progress tab, "Tracking list" (was /dashboard/progress)
 *
 * Every query runs inside the shared OKR visibility rule
 * (lib/okr/visibility-scope.ts: not DELETED, objective record scope); rows the
 * viewer may only see redacted keep their numbers but show the `[Private …]` title.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildKeyResultVisibilityWhere,
  buildObjectiveVisibilityWhere,
  loadViewerContext,
  redactKeyResultForViewer,
  redactObjectiveForViewer,
} from '@/lib/okr/visibility-scope'
import {
  completionRate as completionRateOf,
  countByGoalStatus,
  isObjectiveComplete,
} from '@/lib/okr/progress-thresholds'
import type {
  AnalyticsFilters,
  AnalyticsKpis,
  ContributorRow,
  DepartmentRow,
  DistributionData,
  TrendPoint,
} from '@/components/dashboard/AppleAnalytics'

interface Viewer {
  id: string
  role: string
}

// ─── Overview (analytics) ───────────────────────────────────────────────────

export async function loadAnalyticsOverview(viewer: Viewer, filters: AnalyticsFilters) {
  const [timeframes, departmentsRaw] = await Promise.all([
    prisma.timeframe.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true, isActive: true, startDate: true, endDate: true } }),
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ])

  const activeTimeframe = filters.timeframe
    ? timeframes.find((t) => t.id === filters.timeframe)
    : timeframes.find((t) => t.isActive) ?? timeframes[0]

  // The page only shows aggregates and owner names, which redaction keeps visible.
  const ctx = await loadViewerContext({ id: viewer.id, role: viewer.role })
  const objWhere: Prisma.ObjectiveWhereInput = { status: 'ACTIVE' }
  if (activeTimeframe) objWhere.timeframeId = activeTimeframe.id
  if (filters.department) objWhere.departmentId = filters.department
  if (filters.level) objWhere.level = filters.level as Prisma.ObjectiveWhereInput['level']

  const objectives = await prisma.objective.findMany({
    where: { AND: [buildObjectiveVisibilityWhere(ctx), objWhere] },
    include: {
      keyResults: { where: { status: 'ACTIVE' }, select: { id: true, progress: true, confidence: true } },
      owner: { select: { id: true, name: true, avatar: true } },
      department: { select: { id: true, name: true } },
    },
  })

  const totalObjectives = objectives.length
  const avgProgress = totalObjectives
    ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / totalObjectives)
    : 0
  const allKrs = objectives.flatMap((o) => o.keyResults)
  const atRiskKrs = allKrs.filter((kr) => kr.confidence === 'AT_RISK' || kr.confidence === 'OFF_TRACK').length
  const atRiskPct = allKrs.length ? Math.round((atRiskKrs / allKrs.length) * 100) : 0
  // Completion = CLOSED or 100% (lib/okr/progress-thresholds.ts) — not ≥75%.
  const completionRate = completionRateOf(objectives)

  // Expected progress at "now" relative to the active timeframe.
  let expectedProgress = 0
  if (activeTimeframe) {
    const start = new Date(activeTimeframe.startDate).getTime()
    const end = new Date(activeTimeframe.endDate).getTime()
    const dur = end - start
    expectedProgress = dur > 0 ? Math.round(Math.max(0, Math.min(100, ((Date.now() - start) / dur) * 100))) : 0
  }

  const kpis: AnalyticsKpis = { totalObjectives, avgProgress, expectedProgress, atRiskPct, completionRate }

  // Trend points — confidence snapshots aggregated by periodStart for these objectives.
  const objIds = objectives.map((o) => o.id)
  const snapshots = objIds.length
    ? await prisma.confidenceSnapshot.findMany({
        where: { entityType: 'OBJECTIVE', entityId: { in: objIds } },
        orderBy: { periodStart: 'asc' },
        select: { periodStart: true, score: true },
      })
    : []
  const byPeriod = new Map<string, number[]>()
  for (const s of snapshots) {
    if (!byPeriod.has(s.periodStart)) byPeriod.set(s.periodStart, [])
    byPeriod.get(s.periodStart)!.push(s.score)
  }
  const nowConfidence = Math.max(0, Math.min(100, 50 + (avgProgress - expectedProgress)))
  let trendPoints: TrendPoint[] = Array.from(byPeriod.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([date, scores]) => {
      const conf = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      return {
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        progress: conf,
        confidence: conf,
      }
    })
  // Append "now" as the last burn-up sample so the line ends at avgProgress.
  if (trendPoints.length === 0) {
    trendPoints = [
      { label: 'Start', progress: 0, confidence: 50 },
      { label: 'Now', progress: avgProgress, confidence: nowConfidence },
    ]
  } else {
    trendPoints.push({ label: 'Now', progress: avgProgress, confidence: nowConfidence })
  }

  const distribution: DistributionData = {
    onTrack: allKrs.filter((kr) => kr.confidence === 'ON_TRACK').length,
    atRisk: allKrs.filter((kr) => kr.confidence === 'AT_RISK').length,
    offTrack: allKrs.filter((kr) => kr.confidence === 'OFF_TRACK').length,
    done: objectives.filter(isObjectiveComplete).length,
  }

  // Top contributors — objectives grouped by owner.
  const ownerMap = new Map<string, { id: string; name: string; avatar: string | null; count: number; totalProgress: number }>()
  for (const o of objectives) {
    const existing = ownerMap.get(o.owner.id) ?? {
      id: o.owner.id, name: o.owner.name, avatar: o.owner.avatar, count: 0, totalProgress: 0,
    }
    existing.count += 1
    existing.totalProgress += o.progress
    ownerMap.set(o.owner.id, existing)
  }
  const contributors: ContributorRow[] = Array.from(ownerMap.values())
    .map((o) => ({ id: o.id, name: o.name, avatar: o.avatar, okrCount: o.count, avgProgress: Math.round(o.totalProgress / o.count) }))
    .sort((a, b) => b.avgProgress - a.avgProgress || b.okrCount - a.okrCount)

  const departmentRows: DepartmentRow[] = departmentsRaw.map((d) => {
    const deptObjs = objectives.filter((o) => o.department?.id === d.id)
    const avg = deptObjs.length ? Math.round(deptObjs.reduce((s, o) => s + o.progress, 0) / deptObjs.length) : 0
    return { id: d.id, name: d.name, objectiveCount: deptObjs.length, avgProgress: avg }
  })

  return {
    filters,
    timeframes: timeframes.map((t) => ({ id: t.id, name: t.name })),
    departments: departmentsRaw,
    kpis,
    trendPoints,
    expectedAtNow: expectedProgress,
    distribution,
    contributors,
    departmentRows,
  }
}

// ─── Progress: tracking list (was /dashboard/progress) ──────────────────────

/**
 * Personal tracking scope: EMPLOYEE → own objectives; DEPARTMENT_LEAD → own +
 * their departments'; ADMIN/EXECUTIVE → all — always within the OKR visibility rule.
 */
export async function loadProgressTracking(viewer: Viewer) {
  const ctx = await loadViewerContext({ id: viewer.id, role: viewer.role })
  const filters: Prisma.ObjectiveWhereInput[] = [buildObjectiveVisibilityWhere(ctx), { status: 'ACTIVE' }]
  if (viewer.role === 'EMPLOYEE') {
    filters.push({ ownerId: viewer.id })
  } else if (viewer.role === 'DEPARTMENT_LEAD') {
    filters.push({ OR: [{ ownerId: viewer.id }, { departmentId: { in: Array.from(ctx.departmentIds) } }] })
  }

  const rawObjectives = await prisma.objective.findMany({
    where: { AND: filters },
    include: {
      owner: { select: { id: true, name: true, avatar: true } },
      timeframe: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      _count: { select: { keyResults: { where: { status: { not: 'DELETED' } } } } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  const objectives = rawObjectives.map((o) => redactObjectiveForViewer(ctx, o))

  // Health = goalStatus (the field the row's StatusPill shows); progress % only drives the bar colour.
  const { onTrack, atRisk, offTrack } = countByGoalStatus(objectives)
  const avgProgress =
    objectives.length > 0 ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length) : 0

  return {
    kpis: { onTrack, atRisk, offTrack, avgProgress },
    objectives: objectives.map((o) => ({
      id: o.id,
      title: o.title,
      goalStatus: o.goalStatus,
      progress: o.progress,
      ownerName: o.owner?.name ?? null,
      keyResultCount: o._count.keyResults,
      timeframeName: o.timeframe?.name ?? null,
      departmentName: o.department?.name ?? null,
    })),
  }
}

export type ProgressTrackingData = Awaited<ReturnType<typeof loadProgressTracking>>

// ─── Progress: status dashboard (was /dashboard/progress-report) ────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function startOfIsoWeek(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() - day + 1)
  return copy
}

export interface StatusRow {
  id: string
  kind: 'OBJ' | 'KR'
  title: string
  owner: string
  href: string
  progress: number
  status: 'off-track' | 'at-risk'
}

export interface StatusSummary {
  total: number
  completed: number
  completionPct: number
  onTrack: number
  atRisk: number
  offTrack: number
}

export interface WeeklyBucket {
  week: string
  on: number
  at: number
  off: number
  total: number
}

/** Every active OKR the viewer may see. */
export async function loadProgressDashboard(viewer: Viewer) {
  const ctx = await loadViewerContext({ id: viewer.id, role: viewer.role })
  const [rawObjectives, rawKeyResults] = await Promise.all([
    prisma.objective.findMany({
      where: { AND: [buildObjectiveVisibilityWhere(ctx), { status: 'ACTIVE' }] },
      select: {
        id: true,
        title: true,
        progress: true,
        goalStatus: true,
        level: true,
        isPrivate: true,
        ownerId: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, avatar: true } },
      },
    }),
    prisma.keyResult.findMany({
      where: { AND: [buildKeyResultVisibilityWhere(ctx), { status: 'ACTIVE' }] },
      select: {
        id: true,
        title: true,
        progress: true,
        confidence: true,
        isPrivate: true,
        ownerId: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, avatar: true } },
        objective: { select: { ownerId: true, isPrivate: true } },
      },
    }),
  ])
  const objectives = rawObjectives.map((o) => redactObjectiveForViewer(ctx, o))
  const keyResults = rawKeyResults.map((k) => redactKeyResultForViewer(ctx, k, k.objective))

  const { onTrack: objOnTrack, atRisk: objAtRisk, offTrack: objOffTrack } = countByGoalStatus(objectives)
  const objCompleted = objectives.filter(isObjectiveComplete).length

  const krOnTrack = keyResults.filter((k) => k.confidence === 'ON_TRACK').length
  const krAtRisk = keyResults.filter((k) => k.confidence === 'AT_RISK').length
  const krOffTrack = keyResults.filter((k) => k.confidence === 'OFF_TRACK').length
  const krCompleted = keyResults.filter((k) => k.progress >= 100).length

  const offTrackObjectives = objectives.filter((o) => o.goalStatus === 'OFF_TRACK').sort((a, b) => a.progress - b.progress).slice(0, 20)
  const atRiskObjectives = objectives.filter((o) => o.goalStatus === 'AT_RISK').sort((a, b) => a.progress - b.progress).slice(0, 20)
  const offTrackKrs = keyResults.filter((k) => k.confidence === 'OFF_TRACK').sort((a, b) => a.progress - b.progress).slice(0, 20)
  const atRiskKrs = keyResults.filter((k) => k.confidence === 'AT_RISK').sort((a, b) => a.progress - b.progress).slice(0, 20)

  const tenWeeksAgoIso = new Date(Date.now() - 10 * WEEK_MS).toISOString().slice(0, 10)
  const visibleEntityIds = [...objectives.map((o) => o.id), ...keyResults.map((k) => k.id)]
  const snapshots = await prisma.confidenceSnapshot.findMany({
    where: { periodStart: { gte: tenWeeksAgoIso }, entityId: { in: visibleEntityIds } },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, confidence: true, entityType: true },
  })

  const weeks: string[] = []
  for (let i = 9; i >= 0; i--) {
    weeks.push(startOfIsoWeek(new Date(Date.now() - i * WEEK_MS)).toISOString().slice(0, 10))
  }
  type Bucket = { on: number; at: number; off: number; total: number }
  const objBuckets = new Map<string, Bucket>()
  const krBuckets = new Map<string, Bucket>()
  for (const w of weeks) {
    objBuckets.set(w, { on: 0, at: 0, off: 0, total: 0 })
    krBuckets.set(w, { on: 0, at: 0, off: 0, total: 0 })
  }
  for (const s of snapshots) {
    const parsed = new Date(s.periodStart)
    if (Number.isNaN(parsed.getTime())) continue
    const key = startOfIsoWeek(parsed).toISOString().slice(0, 10)
    const bucket = s.entityType === 'OBJECTIVE' ? objBuckets.get(key) : krBuckets.get(key)
    if (!bucket) continue
    if (s.confidence === 'ON_TRACK') bucket.on++
    else if (s.confidence === 'AT_RISK') bucket.at++
    else if (s.confidence === 'OFF_TRACK') bucket.off++
    bucket.total++
  }
  // The current week falls back to live counts when no snapshot exists yet.
  const latest = weeks[weeks.length - 1]
  const latestObj = objBuckets.get(latest)!
  if (latestObj.total === 0) {
    Object.assign(latestObj, { on: objOnTrack, at: objAtRisk, off: objOffTrack, total: objOnTrack + objAtRisk + objOffTrack })
  }
  const latestKr = krBuckets.get(latest)!
  if (latestKr.total === 0) {
    Object.assign(latestKr, { on: krOnTrack, at: krAtRisk, off: krOffTrack, total: krOnTrack + krAtRisk + krOffTrack })
  }

  const objectiveSummary: StatusSummary = {
    total: objectives.length,
    completed: objCompleted,
    completionPct: objectives.length > 0 ? (objCompleted / objectives.length) * 100 : 0,
    onTrack: objOnTrack,
    atRisk: objAtRisk,
    offTrack: objOffTrack,
  }
  const keyResultSummary: StatusSummary = {
    total: keyResults.length,
    completed: krCompleted,
    completionPct: keyResults.length > 0 ? (krCompleted / keyResults.length) * 100 : 0,
    onTrack: krOnTrack,
    atRisk: krAtRisk,
    offTrack: krOffTrack,
  }

  const objRow = (status: StatusRow['status']) => (o: (typeof objectives)[number]): StatusRow => ({
    id: o.id, kind: 'OBJ', title: o.title, owner: o.owner?.name ?? '—', href: `/dashboard/objectives/${o.id}`, progress: o.progress, status,
  })
  const krRow = (status: StatusRow['status']) => (k: (typeof keyResults)[number]): StatusRow => ({
    id: k.id, kind: 'KR', title: k.title, owner: k.owner?.name ?? '—', href: `/dashboard/key-results/${k.id}`, progress: k.progress, status,
  })

  return {
    objectiveSummary,
    keyResultSummary,
    objectiveWeekly: weeks.map((w): WeeklyBucket => ({ week: w.slice(5), ...objBuckets.get(w)! })),
    keyResultWeekly: weeks.map((w): WeeklyBucket => ({ week: w.slice(5), ...krBuckets.get(w)! })),
    offTrack: {
      subtitle: `${offTrackObjectives.length} objectives · ${offTrackKrs.length} key results`,
      rows: [...offTrackObjectives.map(objRow('off-track')), ...offTrackKrs.map(krRow('off-track'))],
    },
    atRisk: {
      subtitle: `${atRiskObjectives.length} objectives · ${atRiskKrs.length} key results`,
      rows: [...atRiskObjectives.map(objRow('at-risk')), ...atRiskKrs.map(krRow('at-risk'))],
    },
  }
}

export type ProgressDashboardData = Awaited<ReturnType<typeof loadProgressDashboard>>
