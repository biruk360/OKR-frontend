import type { NextRequest } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'
import { canCreateTemplates, canReadTemplates, hasPerformancePermission, isPerformanceAdmin } from '@/lib/performance'

const DEFAULT_GATEKEEPER = { tierName: 'Tier 1: Core Execution & Mindset', threshold: 25, failureBand: 'Not Ready' }
const DEFAULT_BANDS = [
  { min: 85, label: 'Ready' },
  { min: 70, label: 'On Track' },
  { min: 0, label: 'Not Ready' },
]

export const GET = withAuth(async (_request, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  if (!await canReadTemplates(actor)) return apiForbidden('You do not have access to scorecard templates')
  const admin = await isPerformanceAdmin(actor)
  const rows = await prisma.scorecardTemplate.findMany({
    where: admin ? undefined : { status: 'PUBLISHED' },
    include: {
      family: { select: { id: true, name: true, roleLabel: true, isActive: true } },
      _count: { select: { tiers: true, evaluations: true } },
    },
    orderBy: [{ family: { name: 'asc' } }, { version: 'desc' }],
  })
  return apiSuccess(rows)
})

export const POST = withAuth(async (request: NextRequest, { session }) => {
  const actor = { userId: session.user.id, role: session.user.role }
  const canCreate = await Promise.all([
    canCreateTemplates(actor),
    hasPerformancePermission(actor, 'scorecard_template_family', 'create'),
  ])
  if (!canCreate.every(Boolean)) return apiForbidden('You do not have permission to create scorecard templates')

  const body = await request.json().catch(() => ({}))
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const roleLabel = typeof body.roleLabel === 'string' ? body.roleLabel.trim() || null : null
  if (!name) return apiBadRequest('Template name is required')

  const created = await prisma.$transaction(async (tx) => {
    const family = await tx.scorecardTemplateFamily.upsert({
      where: { name },
      create: { name, roleLabel, createdById: session.user.id },
      update: roleLabel ? { roleLabel, isActive: true } : { isActive: true },
    })
    const latest = await tx.scorecardTemplate.findFirst({
      where: { familyId: family.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    return tx.scorecardTemplate.create({
      data: {
        familyId: family.id,
        version: (latest?.version ?? 0) + 1,
        status: 'DRAFT',
        maxTotal: 0,
        gatekeeperJson: (body.gatekeeper ?? DEFAULT_GATEKEEPER) as Prisma.InputJsonValue,
        bandsJson: (body.bands ?? DEFAULT_BANDS) as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
      include: { family: true, tiers: true },
    })
  })

  return apiSuccess(created, { status: 201 })
})
