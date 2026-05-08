import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, withAuth } from '@/lib/api'

const POINTS = 12

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const day = out.getDay()
  const diff = (day + 6) % 7
  out.setDate(out.getDate() - diff)
  return out
}

function pct(currentValue: number, startValue: number, targetValue: number): number {
  const span = targetValue - startValue
  if (!Number.isFinite(span) || span === 0) return 0
  const p = ((currentValue - startValue) / span) * 100
  if (!Number.isFinite(p)) return 0
  return Math.min(Math.max(p, 0), 100)
}

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'key-results'

  const confidence = searchParams.get('confidence')
  const ownerId = searchParams.get('ownerId')
  const timeframeId = searchParams.get('timeframeId')
  const status = searchParams.get('status')

  const krWhere: any = { status: 'ACTIVE' }
  if (session.user.role === 'EMPLOYEE') {
    krWhere.OR = [{ ownerId: session.user.id }, { isPrivate: false }]
  }
  if (status && status !== 'ACTIVE') krWhere.status = status
  if (confidence) krWhere.confidence = { in: confidence.split(',') }
  if (ownerId) krWhere.ownerId = ownerId
  if (timeframeId) krWhere.objective = { timeframeId }

  if (tab === 'objectives') {
    const objWhere: any = {}
    if (status) objWhere.status = status
    if (confidence) objWhere.confidence = { in: confidence.split(',') }
    if (ownerId) objWhere.ownerId = ownerId
    if (timeframeId) objWhere.timeframeId = timeframeId
    const objs = await prisma.objective.findMany({
      where: objWhere,
      select: { id: true, keyResults: { select: { id: true, startValue: true, targetValue: true } } },
      take: 1000,
    })
    const krMap = new Map<string, { startValue: number; targetValue: number }>()
    for (const o of objs) for (const k of o.keyResults) krMap.set(k.id, k)
    return apiSuccess(await buildSeries(Array.from(krMap.keys()), krMap))
  }

  const krs = await prisma.keyResult.findMany({
    where: krWhere,
    select: { id: true, startValue: true, targetValue: true },
    take: 1000,
  })
  const krMap = new Map(krs.map((k) => [k.id, { startValue: k.startValue, targetValue: k.targetValue }]))
  return apiSuccess(await buildSeries(krs.map((k) => k.id), krMap))
})

async function buildSeries(
  krIds: string[],
  krMap: Map<string, { startValue: number; targetValue: number }>,
): Promise<{ label: string; date: string; avgProgress: number; krCount: number }[]> {
  const now = new Date()
  const weeks: Date[] = []
  const thisWeekStart = startOfWeek(now)
  for (let i = POINTS - 1; i >= 0; i--) {
    const d = new Date(thisWeekStart)
    d.setDate(d.getDate() - i * 7)
    weeks.push(d)
  }

  if (krIds.length === 0) {
    return weeks.map((w) => ({
      label: formatLabel(w),
      date: w.toISOString(),
      avgProgress: 0,
      krCount: 0,
    }))
  }

  const since = weeks[0]
  const checkIns = await prisma.keyResultCheckIn.findMany({
    where: { keyResultId: { in: krIds }, asOfDate: { lt: new Date(weeks[weeks.length - 1].getTime() + 7 * 86400_000) } },
    orderBy: { asOfDate: 'asc' },
    select: { keyResultId: true, asOfDate: true, value: true },
  })

  // Find each KR's last value before `since` (baseline = startValue if none).
  const baselineByKr = new Map<string, number>()
  for (const id of krIds) {
    const kr = krMap.get(id)
    baselineByKr.set(id, kr?.startValue ?? 0)
  }
  for (const c of checkIns) {
    if (c.asOfDate < since) baselineByKr.set(c.keyResultId, c.value)
  }

  const series: { label: string; date: string; avgProgress: number; krCount: number }[] = []
  const currentValueByKr = new Map(baselineByKr)
  let ciIdx = 0
  // Skip pre-window check-ins (already folded into baseline).
  while (ciIdx < checkIns.length && checkIns[ciIdx].asOfDate < since) ciIdx++

  for (let i = 0; i < weeks.length; i++) {
    const weekStart = weeks[i]
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000)
    while (ciIdx < checkIns.length && checkIns[ciIdx].asOfDate < weekEnd) {
      currentValueByKr.set(checkIns[ciIdx].keyResultId, checkIns[ciIdx].value)
      ciIdx++
    }
    let sum = 0
    let n = 0
    for (const id of krIds) {
      const kr = krMap.get(id)
      if (!kr) continue
      const v = currentValueByKr.get(id) ?? kr.startValue
      sum += pct(v, kr.startValue, kr.targetValue)
      n++
    }
    series.push({
      label: formatLabel(weekStart),
      date: weekStart.toISOString(),
      avgProgress: n ? Math.round(sum / n) : 0,
      krCount: n,
    })
  }
  return series
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
