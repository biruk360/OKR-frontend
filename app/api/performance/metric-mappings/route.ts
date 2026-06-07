import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { canManageTemplates, hasPerformancePermission } from '@/lib/performance'

async function canManageMappings(actor: { userId: string; role: string }, action: 'read' | 'write' | 'delete'): Promise<boolean> {
  return await canManageTemplates(actor, 'button.performance.template.map-metric')
    && await hasPerformancePermission(actor, 'metric_source_mapping', action)
}

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
    },
    orderBy: [{ employee: { name: 'asc' } }, { criterion: { title: 'asc' } }, { position: 'asc' }],
  })
  return apiSuccess(mappings)
})

export const PUT = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'write')) return apiForbidden('You do not have permission to manage metric mappings')

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const criterionId = typeof body.criterionId === 'string' ? body.criterionId : ''
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : ''
  const keyResultIds: string[] | null = Array.isArray(body.keyResultIds)
    ? Array.from(new Set<string>(body.keyResultIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)))
    : null
  if (!criterionId || !employeeId || !keyResultIds) {
    return apiBadRequest('criterionId, employeeId, and keyResultIds are required')
  }

  const [criterion, employee, keyResults] = await Promise.all([
    prisma.scorecardCriterion.findUnique({
      where: { id: criterionId },
      select: { id: true, type: true, scoringRuleJson: true },
    }),
    prisma.user.findUnique({ where: { id: employeeId }, select: { id: true, isActive: true } }),
    prisma.keyResult.findMany({
      where: { id: { in: keyResultIds } },
      select: { id: true, ownerId: true, status: true },
    }),
  ])
  if (!criterion) return apiNotFound('Scorecard criterion not found')
  if (criterion.type !== 'METRIC') return apiBadRequest('Only metric criteria can be linked to Key Results')
  if (!employee?.isActive) return apiBadRequest('Metric mappings require an active employee')
  const rule = criterion.scoringRuleJson as Record<string, unknown> | null
  if (rule?.type !== 'MANUAL' && keyResultIds.length === 0) {
    return apiBadRequest('An automatic metric criterion requires at least one Key Result')
  }
  if (keyResults.length !== keyResultIds.length) return apiBadRequest('One or more Key Results do not exist')
  if (keyResults.some((keyResult) => keyResult.ownerId !== employeeId)) {
    return apiBadRequest('Every linked Key Result must be owned by the selected employee')
  }
  if (keyResults.some((keyResult) => keyResult.status !== 'ACTIVE')) {
    return apiBadRequest('Only active Key Results can be linked')
  }

  const mappings = await prisma.$transaction(async (tx) => {
    await tx.metricSourceMapping.deleteMany({ where: { criterionId, employeeId } })
    if (keyResultIds.length > 0) {
      await tx.metricSourceMapping.createMany({
        data: keyResultIds.map((keyResultId, position) => ({ criterionId, employeeId, keyResultId, position })),
      })
    }
    return tx.metricSourceMapping.findMany({
      where: { criterionId, employeeId },
      include: { keyResult: { select: { id: true, title: true, currentValue: true, targetValue: true, unit: true } } },
      orderBy: { position: 'asc' },
    })
  })
  return apiSuccess(mappings)
})

export const DELETE = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canManageMappings(actor, 'delete')) return apiForbidden('You do not have permission to delete metric mappings')
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return apiBadRequest('Mapping id is required')
  await prisma.metricSourceMapping.delete({ where: { id } })
  return apiSuccess({ id })
})
