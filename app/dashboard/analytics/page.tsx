import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import AppleAnalytics, {
  type AnalyticsFilters,
  type AnalyticsKpis,
  type ContributorRow,
  type DepartmentRow,
  type DistributionData,
  type TrendPoint,
} from '@/components/dashboard/AppleAnalytics'

interface Props {
  searchParams?: { timeframe?: string; department?: string; level?: string }
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  const filters: AnalyticsFilters = {
    timeframe: searchParams?.timeframe ?? '',
    department: searchParams?.department ?? '',
    level: searchParams?.level ?? '',
  }

  const [timeframes, departmentsRaw] = await Promise.all([
    prisma.timeframe.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true, isActive: true, startDate: true, endDate: true } }),
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ])

  // Resolve effective timeframe
  let activeTimeframe = filters.timeframe
    ? timeframes.find(t => t.id === filters.timeframe)
    : timeframes.find(t => t.isActive) ?? timeframes[0]

  // Build objective where
  const objWhere: Prisma.ObjectiveWhereInput = { status: 'ACTIVE' }
  if (activeTimeframe) objWhere.timeframeId = activeTimeframe.id
  if (filters.department) objWhere.departmentId = filters.department
  if (filters.level) objWhere.level = filters.level as any

  const objectives = await prisma.objective.findMany({
    where: objWhere,
    include: {
      keyResults: { where: { status: 'ACTIVE' }, select: { id: true, progress: true, confidence: true } },
      owner: { select: { id: true, name: true, avatar: true } },
      department: { select: { id: true, name: true } },
    },
  })

  // KPIs
  const totalObjectives = objectives.length
  const avgProgress = totalObjectives
    ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / totalObjectives)
    : 0
  const allKrs = objectives.flatMap(o => o.keyResults)
  const atRiskKrs = allKrs.filter(kr => kr.confidence === 'AT_RISK' || kr.confidence === 'OFF_TRACK').length
  const atRiskPct = allKrs.length ? Math.round((atRiskKrs / allKrs.length) * 100) : 0
  const completed = objectives.filter(o => o.progress >= 75).length
  const completionRate = totalObjectives ? Math.round((completed / totalObjectives) * 100) : 0

  // Expected progress at "now" relative to active timeframe
  let expectedProgress = 0
  if (activeTimeframe) {
    const start = new Date(activeTimeframe.startDate).getTime()
    const end = new Date(activeTimeframe.endDate).getTime()
    const now = Date.now()
    const dur = end - start
    expectedProgress = dur > 0 ? Math.round(Math.max(0, Math.min(100, ((now - start) / dur) * 100))) : 0
  }

  const kpis: AnalyticsKpis = { totalObjectives, avgProgress, expectedProgress, atRiskPct, completionRate }

  // Trend points — confidence snapshots aggregated by periodStart for these objectives
  const objIds = objectives.map(o => o.id)
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
  // Append current "now" as the last burn-up sample so the line ends at avgProgress
  if (trendPoints.length === 0) {
    trendPoints = [
      { label: 'Start', progress: 0, confidence: 50 },
      { label: 'Now', progress: avgProgress, confidence: Math.max(0, Math.min(100, 50 + (avgProgress - expectedProgress))) },
    ]
  } else {
    trendPoints.push({
      label: 'Now',
      progress: avgProgress,
      confidence: Math.max(0, Math.min(100, 50 + (avgProgress - expectedProgress))),
    })
  }

  // Distribution
  const distribution: DistributionData = {
    onTrack: allKrs.filter(kr => kr.confidence === 'ON_TRACK').length,
    atRisk: allKrs.filter(kr => kr.confidence === 'AT_RISK').length,
    offTrack: allKrs.filter(kr => kr.confidence === 'OFF_TRACK').length,
    done: objectives.filter(o => o.progress >= 100).length,
  }

  // Top contributors — group objectives by owner
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
    .map(o => ({ id: o.id, name: o.name, avatar: o.avatar, okrCount: o.count, avgProgress: Math.round(o.totalProgress / o.count) }))
    .sort((a, b) => b.avgProgress - a.avgProgress || b.okrCount - a.okrCount)

  // Department rows
  const departmentRows: DepartmentRow[] = departmentsRaw.map(d => {
    const deptObjs = objectives.filter(o => o.department?.id === d.id)
    const avg = deptObjs.length ? Math.round(deptObjs.reduce((s, o) => s + o.progress, 0) / deptObjs.length) : 0
    return { id: d.id, name: d.name, objectiveCount: deptObjs.length, avgProgress: avg }
  })

  return (
    <AppleAnalytics
      filters={filters}
      timeframes={timeframes.map(t => ({ id: t.id, name: t.name }))}
      departments={departmentsRaw}
      kpis={kpis}
      trendPoints={trendPoints}
      expectedAtNow={expectedProgress}
      distribution={distribution}
      contributors={contributors}
      departmentRows={departmentRows}
    />
  )
}
