import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { assertTemplateEditable, canManageTemplates, canReadTemplates, hasPerformancePermission, isPerformanceAdmin } from '@/lib/performance'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canReadTemplates(actor)) return apiForbidden('You do not have access to scorecard templates')
  const { id } = await resolveParams(params)
  const template = await prisma.scorecardTemplate.findUnique({
    where: { id },
    include: {
      family: {
        include: {
          templates: {
            select: { id: true, version: true, status: true, publishedAt: true, _count: { select: { evaluations: true } } },
            orderBy: { version: 'desc' },
          },
        },
      },
      tiers: { orderBy: { position: 'asc' }, include: { criteria: { orderBy: { position: 'asc' } } } },
      _count: { select: { evaluations: true } },
    },
  })
  if (!template) return apiNotFound('Scorecard template not found')
  if (template.status !== 'PUBLISHED' && !await isPerformanceAdmin(actor)) {
    return apiForbidden('Draft and archived templates are restricted')
  }
  return apiSuccess(template)
})

export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  const allowed = await Promise.all([
    canManageTemplates(actor),
    hasPerformancePermission(actor, 'scorecard_template_family', 'write'),
  ])
  if (!allowed.every(Boolean)) return apiForbidden('You do not have permission to edit scorecard templates')
  const { id } = await resolveParams(params)
  const existing = await prisma.scorecardTemplate.findUnique({ where: { id }, include: { family: true } })
  if (!existing) return apiNotFound('Scorecard template not found')
  try {
    assertTemplateEditable(existing.status)
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : 'Template is not editable')
  }
  const body = await request.json().catch(() => ({}))
  const familyName = typeof body.name === 'string' ? body.name.trim() : undefined
  const roleLabel = typeof body.roleLabel === 'string' ? body.roleLabel.trim() || null : undefined
  const updated = await prisma.$transaction(async (tx) => {
    if (familyName !== undefined || roleLabel !== undefined) {
      await tx.scorecardTemplateFamily.update({
        where: { id: existing.familyId },
        data: { ...(familyName ? { name: familyName } : {}), ...(roleLabel !== undefined ? { roleLabel } : {}) },
      })
    }
    return tx.scorecardTemplate.update({
      where: { id },
      data: {
        ...(body.gatekeeper ? { gatekeeperJson: body.gatekeeper as Prisma.InputJsonValue } : {}),
        ...(body.bands ? { bandsJson: body.bands as Prisma.InputJsonValue } : {}),
      },
      include: { family: true },
    })
  })
  return apiSuccess(updated)
})
