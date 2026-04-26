import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiNotFound, apiForbidden, withAuth } from '@/lib/api'
import { recordActivity, type ActivityAction } from '@/lib/activity-log'

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const STATUSES = ['OPEN', 'MITIGATING', 'RESOLVED', 'ACCEPTED'] as const

async function loadRiskAndCheckPermission(riskId: string, userId: string, userRole: string) {
  const risk = await prisma.risk.findUnique({
    where: { id: riskId },
    include: {
      objective: { select: { id: true, ownerId: true } },
      keyResult: { select: { id: true, ownerId: true, objective: { select: { ownerId: true } } } },
    },
  })
  if (!risk) return { risk: null, allowed: false } as const

  const isAdmin = userRole === 'ADMIN' || userRole === 'EXECUTIVE'
  const isReporter = risk.reporterId === userId
  const isObjOwner = risk.objective?.ownerId === userId
  const isKrOwner = risk.keyResult?.ownerId === userId || risk.keyResult?.objective?.ownerId === userId
  return { risk, allowed: isAdmin || isReporter || isObjOwner || isKrOwner }
}

export const PATCH = withAuth<RouteIdParams>(async (req: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')

  const { risk, allowed } = await loadRiskAndCheckPermission(id, session.user.id, session.user.role)
  if (!risk) return apiNotFound('Risk not found')
  if (!allowed) return apiForbidden('You cannot edit this risk')

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if ('description' in body) data.description = body.description?.toString().trim() || null
  if ('mitigation' in body) data.mitigation = body.mitigation?.toString().trim() || null
  if (typeof body.severity === 'string') {
    if (!SEVERITIES.includes(body.severity as (typeof SEVERITIES)[number])) return apiBadRequest('Invalid severity')
    data.severity = body.severity
  }
  let statusChangedToResolved = false
  if (typeof body.status === 'string') {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) return apiBadRequest('Invalid status')
    data.status = body.status
    if (body.status === 'RESOLVED' && risk.status !== 'RESOLVED') {
      data.resolvedAt = new Date()
      statusChangedToResolved = true
    }
    if (body.status !== 'RESOLVED' && risk.status === 'RESOLVED') {
      data.resolvedAt = null
    }
  }

  const updated = await prisma.risk.update({
    where: { id },
    data,
    include: { reporter: { select: { id: true, name: true, avatar: true, email: true } } },
  })

  const action: ActivityAction = statusChangedToResolved ? 'RISK_RESOLVED' : 'RISK_UPDATED'
  await recordActivity({
    entityType: risk.objectiveId ? 'OBJECTIVE' : 'KEY_RESULT',
    objectiveId: risk.objectiveId,
    keyResultId: risk.keyResultId,
    action,
    actorId: session.user.id,
    metadata: { riskId: risk.id, title: updated.title, severity: updated.severity, status: updated.status },
  })

  return apiSuccess(updated)
})

export const DELETE = withAuth<RouteIdParams>(async (_req: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid id')

  const risk = await prisma.risk.findUnique({ where: { id } })
  if (!risk) return apiNotFound('Risk not found')

  const isAdmin = session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE'
  if (!isAdmin && risk.reporterId !== session.user.id) {
    return apiForbidden('Only the reporter or an admin can delete this risk')
  }

  await prisma.risk.delete({ where: { id } })

  await recordActivity({
    entityType: risk.objectiveId ? 'OBJECTIVE' : 'KEY_RESULT',
    objectiveId: risk.objectiveId,
    keyResultId: risk.keyResultId,
    action: 'RISK_DELETED',
    actorId: session.user.id,
    metadata: { riskId: risk.id, title: risk.title },
  })

  return apiSuccess({ id })
})
