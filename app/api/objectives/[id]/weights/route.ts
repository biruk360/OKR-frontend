import { prisma } from '@/lib/prisma'
import { canEditObjective } from '@/lib/permissions'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { recordActivity } from '@/lib/activity-log'
import {
  recalcNodeAndAncestors,
  contributionPercents,
} from '@/lib/objectiveProgress'
import {
  apiSuccess,
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  withAuth,
} from '@/lib/api'

interface WeightInput {
  id: string
  weight: number
}

interface PatchBody {
  /** Weights for KRs directly under this objective. */
  keyResults?: WeightInput[]
  /** Weights for child objectives aligned under this objective. */
  childObjectives?: WeightInput[]
}

/** GET — return current weights + computed contribution % for KRs and child objectives. */
export const GET = withAuth<RouteIdParams>(async (_req, { params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const objective = await prisma.objective.findUnique({ where: { id } })
  if (!objective) return apiNotFound('Objective not found')

  const keyResults = await prisma.keyResult.findMany({
    where: { objectiveId: id, status: 'ACTIVE' },
    select: { id: true, title: true, weight: true, progress: true, confidence: true },
    orderBy: { createdAt: 'asc' },
  })
  const childObjectives = await prisma.objective.findMany({
    where: { parentObjectiveId: id, status: 'ACTIVE' },
    select: { id: true, title: true, weight: true, progress: true, goalStatus: true },
    orderBy: { createdAt: 'asc' },
  })

  const krContrib = contributionPercents(keyResults)
  const objContrib = contributionPercents(childObjectives)

  return apiSuccess({
    keyResults: keyResults.map((k) => ({ ...k, contribution: krContrib[k.id] ?? 0 })),
    childObjectives: childObjectives.map((o) => ({ ...o, contribution: objContrib[o.id] ?? 0 })),
  })
})

/** PATCH — bulk update weights for KRs and/or child objectives under this objective. */
export const PATCH = withAuth<RouteIdParams>(async (req, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid objective id')

  const existing = await prisma.objective.findUnique({ where: { id } })
  if (!existing) return apiNotFound('Objective not found')

  const allowed = await canEditObjective(session.user.role as any, session.user.id, {
    level: existing.level,
    ownerId: existing.ownerId,
    departmentId: existing.departmentId,
  })
  if (!allowed) return apiForbidden('Insufficient permissions to edit weights')

  const body = (await req.json().catch(() => ({}))) as PatchBody
  const krUpdates = Array.isArray(body.keyResults) ? body.keyResults : []
  const objUpdates = Array.isArray(body.childObjectives) ? body.childObjectives : []

  const clamp = (n: unknown) => {
    const v = typeof n === 'number' ? n : Number(n)
    if (!Number.isFinite(v) || v < 0) return 0
    return Math.min(100, v)
  }

  await prisma.$transaction(async (tx) => {
    for (const u of krUpdates) {
      if (typeof u.id !== 'string') continue
      await tx.keyResult.updateMany({
        where: { id: u.id, objectiveId: id },
        data: { weight: clamp(u.weight) },
      })
    }
    for (const u of objUpdates) {
      if (typeof u.id !== 'string') continue
      await tx.objective.updateMany({
        where: { id: u.id, parentObjectiveId: id },
        data: { weight: clamp(u.weight) },
      })
    }
    await recalcNodeAndAncestors(tx, id)
  })

  await recordActivity({
    entityType: 'OBJECTIVE',
    objectiveId: id,
    action: 'UPDATED',
    actorId: session.user.id,
    metadata: {
      field: 'weights',
      keyResults: krUpdates.length,
      childObjectives: objUpdates.length,
    },
  })

  return apiSuccess({ updated: true }, { message: 'Weights updated.' })
})
