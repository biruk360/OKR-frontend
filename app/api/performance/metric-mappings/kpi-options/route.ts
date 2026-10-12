import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { kpiSourceRuleIssue } from '@/lib/performance/metric-resolver'
import { MAPPING_KPI_SELECT, canManageMappings, loadKpiVisibility } from '../shared'

/**
 * KPI-9 — package KPIs the metric-mapping picker may offer for one employee
 * (and, when `criterionId` is given, whether each fits that criterion's
 * scoring rule). Active KPIs plus any already linked to the criterion; KPIs the
 * viewer may not see (KPI-7) are left out.
 *
 * GET /api/performance/metric-mappings/kpi-options?employeeId=&criterionId=
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'read')) return apiForbidden('You do not have permission to view metric mappings')

  const searchParams = new URL(request.url).searchParams
  const employeeId = searchParams.get('employeeId') || ''
  const criterionId = searchParams.get('criterionId') || ''
  if (!employeeId) return apiBadRequest('employeeId is required')

  const [criterion, linked] = await Promise.all([
    criterionId
      ? prisma.scorecardCriterion.findUnique({ where: { id: criterionId }, select: { id: true, scoringRuleJson: true } })
      : Promise.resolve(null),
    criterionId
      ? prisma.metricSourceMapping.findMany({
        where: { criterionId, employeeId, kpiId: { not: null } },
        select: { kpiId: true },
      })
      : Promise.resolve([]),
  ])
  if (criterionId && !criterion) return apiNotFound('Scorecard criterion not found')
  const rule = criterion?.scoringRuleJson as Record<string, unknown> | null | undefined
  const ruleType = typeof rule?.type === 'string' ? rule.type : null
  const linkedIds = linked.flatMap((mapping) => (mapping.kpiId ? [mapping.kpiId] : []))

  const [kpis, visibility] = await Promise.all([
    prisma.kpi.findMany({
      where: {
        ownerId: employeeId,
        OR: [{ status: 'ACTIVE' }, ...(linkedIds.length > 0 ? [{ id: { in: linkedIds } }] : [])],
      },
      select: { ...MAPPING_KPI_SELECT, timeframe: { select: { id: true, name: true, startDate: true } } },
      orderBy: [{ timeframe: { startDate: 'desc' } }, { name: 'asc' }],
    }),
    loadKpiVisibility(session, [employeeId]),
  ])

  const visible = kpis.filter((kpi) => visibility.canView(kpi.ownerId, kpi.isSensitive))
  return apiSuccess({
    kpis: visible.map((kpi) => {
      const issue = kpiSourceRuleIssue(kpi.direction, ruleType)
      return {
        id: kpi.id,
        name: kpi.name,
        unit: kpi.unit,
        direction: kpi.direction,
        frequency: kpi.frequency,
        status: kpi.status,
        isSensitive: kpi.isSensitive,
        timeframe: kpi.timeframe ? { id: kpi.timeframe.id, name: kpi.timeframe.name } : null,
        mappable: !issue,
        issue,
      }
    }),
    permissions: {
      canViewKpis: visibility.canView(employeeId, false),
      canViewSensitiveKpis: visibility.canView(employeeId, true),
      hiddenCount: kpis.length - visible.length,
    },
  })
})
