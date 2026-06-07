import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { hasPerformanceFeature, hasPerformancePermission } from '@/lib/performance'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  const actor = { userId: session.user.id, role: session.user.role }
  const allowed = await Promise.all([
    hasPerformanceFeature(actor, 'module.performance'),
    hasPerformanceFeature(actor, 'page.performance.my'),
    hasPerformancePermission(actor, 'improvement_focus', 'write'),
  ])
  if (!allowed.every(Boolean)) return apiForbidden('You do not have permission to update improvement focuses')
  const focus = await prisma.improvementFocus.findUnique({ where: { id } })
  if (!focus) return apiNotFound('Improvement focus not found')
  if (focus.employeeId !== session.user.id) return apiForbidden('Only the employee can update this weekly step')
  if (focus.status !== 'ACTIVE') return apiBadRequest('Only active focuses accept weekly steps')
  const body = await request.json().catch(() => ({}))
  const weeklyStep = typeof body.weeklyStep === 'string' ? body.weeklyStep.trim() : ''
  if (!weeklyStep) return apiBadRequest('weeklyStep is required')
  const updated = await prisma.improvementFocus.update({ where: { id }, data: { weeklyStep } })
  return apiSuccess(updated)
})
