import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { KPI_METRIC_SOURCE, kpiDirectionMixIssue, kpiSourceRuleIssue } from '@/lib/performance/metric-resolver'
import { SCRUM_PERFORMANCE_METRICS } from '@/types/scrum'
import { recordActivity } from '@/lib/activity-log'
import {
  MAPPING_KPI_SELECT,
  canManageMappings,
  loadKpiVisibility,
  redactMappingKpis,
  uniqueIds,
} from './shared'

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'read')) return apiForbidden('You do not have permission to view metric mappings')

  const searchParams = new URL(request.url).searchParams
  const templateId = searchParams.get('templateId') || undefined
  const criterionId = searchParams.get('criterionId') || undefined
  const employeeId = searchParams.get('employeeId') || undefined
  const mappings = await prisma.metricSourceMapping.findMany({
    where: {
      ...(criterionId ? { criterionId } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(templateId ? { criterion: { tier: { templateId } } } : {}),
    },
    include: {
      criterion: { select: { id: true, title: true, type: true } },
      employee: { select: { id: true, name: true, designation: true } },
      keyResult: {
        select: {
          id: true,
          title: true,
          currentValue: true,
          targetValue: true,
          unit: true,
          status: true,
        },
      },
      kpi: { select: MAPPING_KPI_SELECT },
    },
    orderBy: [{ employee: { name: 'asc' } }, { criterion: { title: 'asc' } }, { position: 'asc' }],
  })
  return apiSuccess(await redactMappingKpis(session, mappings))
})

export const PUT = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'write')) return apiForbidden('You do not have permission to manage metric mappings')

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const criterionId = typeof body.criterionId === 'string' ? body.criterionId : ''
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const keyResultIds = uniqueIds(body.keyResultIds)
  // KPI-9: package KPIs owned by the employee (optional; older clients omit it).
  const kpiIds = uniqueIds(body.kpiIds) ?? []
  const scrumMetricKeys: string[] = Array.isArray(body.scrumMetricKeys)
    ? Array.from(new Set<string>(body.scrumMetricKeys.filter((key: unknown): key is string => typeof key === 'string' && !!key)))
    : []
  const invalidScrumKeys = scrumMetricKeys.filter((key) => !SCRUM_PERFORMANCE_METRICS.includes(key as typeof SCRUM_PERFORMANCE_METRICS[number]))
  if (!criterionId || !employeeId || !keyResultIds) {
    return apiBadRequest('criterionId, employeeId, and keyResultIds are required')
  }
  if (invalidScrumKeys.length > 0) {
    return apiBadRequest(`Unsupported Scrum metric source: ${invalidScrumKeys.join(', ')}`)
  }

  const [criterion, employee, keyResults, kpis, previous] = await Promise.all([
    prisma.scorecardCriterion.findUnique({
      where: { id: criterionId },
      select: { id: true, type: true, scoringRuleJson: true },
    }),
    prisma.user.findUnique({ where: { id: employeeId }, select: { id: true, isActive: true } }),
    prisma.keyResult.findMany({
      where: { id: { in: keyResultIds } },
      select: { id: true, ownerId: true, status: true },
    }),
    kpiIds.length > 0
      ? prisma.kpi.findMany({
        where: { id: { in: kpiIds } },
        select: { id: true, name: true, ownerId: true, status: true, direction: true, isSensitive: true },
      })
      : Promise.resolve([]),
    prisma.metricSourceMapping.findMany({
      where: { criterionId, employeeId },
      select: { keyResultId: true, scrumMetricKey: true, kpiId: true },
      orderBy: { position: 'asc' },
    }),
  ])
  if (!criterion) return apiNotFound('Scorecard criterion not found')
  if (criterion.type !== 'METRIC') return apiBadRequest('Only metric criteria can have metric sources')
  if (!employee?.isActive) return apiBadRequest('Metric mappings require an active employee')
  const rule = criterion.scoringRuleJson as Record<string, unknown> | null
  if (rule?.type !== 'MANUAL' && keyResultIds.length + scrumMetricKeys.length + kpiIds.length === 0) {
    return apiBadRequest('An automatic metric criterion requires at least one source')
  }
  if (keyResults.length !== keyResultIds.length) return apiBadRequest('One or more Key Results do not exist')
  if (keyResults.some((keyResult) => keyResult.ownerId !== employeeId)) {
    return apiBadRequest('Every linked Key Result must be owned by the selected employee')
  }
  if (keyResults.some((keyResult) => keyResult.status !== 'ACTIVE')) {
    return apiBadRequest('Only active Key Results can be linked')
  }
  if (kpis.length !== kpiIds.length) return apiBadRequest('One or more KPIs do not exist')
  if (kpis.some((kpi) => kpi.ownerId !== employeeId)) {
    return apiBadRequest('Every linked KPI must belong to the selected employee')
  }
  // A KPI retired after it was linked keeps its link (its readings still count);
  // new links need an active KPI the viewer may see (KPI-7 for sensitive ones).
  const alreadyLinked = new Set(previous.flatMap((mapping) => (mapping.kpiId ? [mapping.kpiId] : [])))
  const added = kpis.filter((kpi) => !alreadyLinked.has(kpi.id))
  if (added.some((kpi) => kpi.status !== 'ACTIVE')) return apiBadRequest('Only active KPIs can be linked')
  if (added.length > 0) {
    const visibility = await loadKpiVisibility(session, [employeeId])
    if (added.some((kpi) => !visibility.canView(kpi.ownerId, kpi.isSensitive))) {
      return apiForbidden('You do not have access to one or more of these KPIs')
    }
  }
  const ruleType = typeof rule?.type === 'string' ? rule.type : null
  for (const kpi of kpis) {
    const issue = kpiSourceRuleIssue(kpi.direction, ruleType)
    if (issue) return apiBadRequest(`${kpi.name}: ${issue}`)
  }
  const mixIssue = kpiDirectionMixIssue(kpis.map((kpi) => kpi.direction))
  if (mixIssue) return apiBadRequest(mixIssue)

  const mappings = await prisma.$transaction(async (tx) => {
    await tx.metricSourceMapping.deleteMany({ where: { criterionId, employeeId } })
    if (keyResultIds.length > 0) {
      await tx.metricSourceMapping.createMany({
        data: keyResultIds.map((keyResultId, position) => ({
          criterionId,
          employeeId,
          sourceType: 'KEY_RESULT',
          keyResultId,
          position,
        })),
      })
    }
    if (scrumMetricKeys.length > 0) {
      await tx.metricSourceMapping.createMany({
        data: scrumMetricKeys.map((scrumMetricKey, offset) => ({
          criterionId,
          employeeId,
          sourceType: 'SCRUM',
          scrumMetricKey,
          position: keyResultIds.length + offset,
        })),
      })
    }
    if (kpiIds.length > 0) {
      await tx.metricSourceMapping.createMany({
        data: kpiIds.map((kpiId, offset) => ({
          criterionId,
          employeeId,
          sourceType: KPI_METRIC_SOURCE,
          kpiId,
          position: keyResultIds.length + scrumMetricKeys.length + offset,
        })),
      })
    }
    return tx.metricSourceMapping.findMany({
      where: { criterionId, employeeId },
      include: {
        keyResult: { select: { id: true, title: true, currentValue: true, targetValue: true, unit: true } },
        kpi: { select: MAPPING_KPI_SELECT },
      },
      orderBy: { position: 'asc' },
    })
  })
  const beforeKr = previous.flatMap((m) => (m.keyResultId ? [m.keyResultId] : []))
  const beforeScrum = previous.flatMap((m) => (m.scrumMetricKey ? [m.scrumMetricKey] : []))
  const beforeKpi = previous.flatMap((m) => (m.kpiId ? [m.kpiId] : []))
  const changes = {
    ...(JSON.stringify(beforeKr) !== JSON.stringify(keyResultIds) ? { keyResultIds: { from: beforeKr, to: keyResultIds } } : {}),
    ...(JSON.stringify(beforeScrum) !== JSON.stringify(scrumMetricKeys) ? { scrumMetricKeys: { from: beforeScrum, to: scrumMetricKeys } } : {}),
    ...(JSON.stringify(beforeKpi) !== JSON.stringify(kpiIds) ? { kpiIds: { from: beforeKpi, to: kpiIds } } : {}),
  }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'PERFORMANCE_SETTINGS',
      action: previous.length === 0 ? 'CREATED' : 'UPDATED',
      actorId: session.user.id,
      changes,
      metadata: { entity: 'METRIC_SOURCE_MAPPING', criterionId, employeeId },
    })
  }
  return apiSuccess(await redactMappingKpis(session, mappings))
})

export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'delete')) return apiForbidden('You do not have permission to delete metric mappings')
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiBadRequest('Mapping id is required')
  const removed = await prisma.metricSourceMapping.findUnique({ where: { id } })
  if (!removed) return apiNotFound('Metric mapping not found')
  await prisma.metricSourceMapping.delete({ where: { id } })
  await recordActivity({
    entityType: 'PERFORMANCE_SETTINGS',
    action: 'DELETED',
    actorId: session.user.id,
    changes: {
      source: { from: removed.keyResultId ?? removed.kpiId ?? removed.scrumMetricKey, to: null },
    },
    metadata: {
      entity: 'METRIC_SOURCE_MAPPING',
      mappingId: id,
      criterionId: removed.criterionId,
      employeeId: removed.employeeId,
      sourceType: removed.sourceType,
    },
  })
  return apiSuccess({ id })
})
