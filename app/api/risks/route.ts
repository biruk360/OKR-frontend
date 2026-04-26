import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiBadRequest, apiNotFound, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

export const GET = withAuth(async (req: NextRequest) => {
  const url = new URL(req.url)
  const objectiveId = url.searchParams.get('objectiveId') || undefined
  const keyResultId = url.searchParams.get('keyResultId') || undefined
  if (!objectiveId && !keyResultId) return apiBadRequest('objectiveId or keyResultId required')
  if (objectiveId && keyResultId) return apiBadRequest('Provide only one of objectiveId or keyResultId')

  const risks = await prisma.risk.findMany({
    where: { objectiveId, keyResultId },
    include: { reporter: { select: { id: true, name: true, avatar: true, email: true } } },
    orderBy: [{ createdAt: 'desc' }],
  })
  // Severity-rank sort (DESC), then createdAt DESC — done in JS since severity is stringly-typed
  risks.sort((a, b) => {
    const r = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
    if (r !== 0) return r
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
  return apiSuccess(risks)
})

export const POST = withAuth(async (req: NextRequest, { session }) => {
  const body = await req.json()
  const { title, description, severity, mitigation, objectiveId, keyResultId } = body ?? {}

  if (!title?.trim()) return apiBadRequest('Title is required')
  if (!SEVERITIES.includes(severity)) return apiBadRequest('Invalid severity')
  if ((!objectiveId && !keyResultId) || (objectiveId && keyResultId)) {
    return apiBadRequest('Provide exactly one of objectiveId or keyResultId')
  }

  if (objectiveId) {
    const exists = await prisma.objective.findUnique({ where: { id: objectiveId }, select: { id: true } })
    if (!exists) return apiNotFound('Objective not found')
  } else if (keyResultId) {
    const exists = await prisma.keyResult.findUnique({ where: { id: keyResultId }, select: { id: true } })
    if (!exists) return apiNotFound('Key result not found')
  }

  const risk = await prisma.risk.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      severity,
      mitigation: mitigation?.trim() || null,
      objectiveId: objectiveId ?? null,
      keyResultId: keyResultId ?? null,
      reporterId: session.user.id,
    },
    include: { reporter: { select: { id: true, name: true, avatar: true, email: true } } },
  })

  await recordActivity({
    entityType: objectiveId ? 'OBJECTIVE' : 'KEY_RESULT',
    objectiveId: objectiveId ?? null,
    keyResultId: keyResultId ?? null,
    action: 'RISK_REPORTED',
    actorId: session.user.id,
    metadata: { riskId: risk.id, title: risk.title, severity: risk.severity },
  })

  return apiSuccess(risk, { status: 201 })
})
