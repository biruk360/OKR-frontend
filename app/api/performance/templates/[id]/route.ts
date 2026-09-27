import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { assertTemplateEditable, canManageTemplates, canReadTemplates, hasPerformancePermission, isPerformanceAdmin } from '@/lib/performance'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'

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
  const changes: ChangeMap = {}
  if (existing.family.name !== updated.family.name) changes.name = { from: existing.family.name, to: updated.family.name }
  if ((existing.family.roleLabel ?? null) !== (updated.family.roleLabel ?? null)) {
    changes.roleLabel = { from: existing.family.roleLabel ?? null, to: updated.family.roleLabel ?? null }
  }
  if (JSON.stringify(existing.gatekeeperJson) !== JSON.stringify(updated.gatekeeperJson)) {
    changes.gatekeeper = { from: existing.gatekeeperJson, to: updated.gatekeeperJson }
  }
  if (JSON.stringify(existing.bandsJson) !== JSON.stringify(updated.bandsJson)) {
    changes.bands = { from: existing.bandsJson, to: updated.bandsJson }
  }
  if (Object.keys(changes).length > 0) {
    await recordActivity({
      entityType: 'PERFORMANCE_SETTINGS',
      action: 'UPDATED',
      actorId: session.user.id,
      changes,
      metadata: { entity: 'SCORECARD_TEMPLATE', templateId: id, familyId: existing.familyId, version: existing.version },
    })
  }
  return apiSuccess(updated)
})
