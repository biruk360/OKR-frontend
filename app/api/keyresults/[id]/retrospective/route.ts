import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canEditKeyResultWithObjectiveContext, canViewKeyResult } from '@/lib/permissions'
import { keyResultLockResponse } from '@/lib/okr/lock-guard'
import { recordActivity } from '@/lib/activity-log'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { buildKeyResultEvidence } from '@/lib/okr/evidence'
import { parseRetrospectiveInput } from '@/lib/okr/retrospective-input'
import { apiBadRequest, apiConflict, apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { broadcastKeyResultEvent } from '@/lib/pusher'
import { OKR_REALTIME_EVENTS } from '@/lib/okr/realtime'

export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')
  const keyResult = await prisma.keyResult.findUnique({ where: { id }, include: { retrospective: true } })
  if (!keyResult) return apiNotFound('Key Result not found')
  const visibility = await canViewKeyResult(session.user.role as any, session.user.id, keyResult)
  // A redacted viewer must not read the reflection either.
  if (!visibility.canView || visibility.isRedacted) return apiForbidden('Access denied')
  const evidence = await buildKeyResultEvidence(prisma, id)
  return apiSuccess({ retrospective: keyResult.retrospective, evidence })
})

export const PUT = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')
  const locked = await keyResultLockResponse(id)
  if (locked) return locked
  const keyResult = await prisma.keyResult.findUnique({
    where: { id },
    include: { objective: { select: { ownerId: true, level: true, departmentId: true } } },
  })
  if (!keyResult) return apiNotFound('Key Result not found')
  if (keyResult.closureStatus !== 'CLOSING') return apiConflict('Start the close workflow before editing its retrospective')
  if (!await canEditKeyResultWithObjectiveContext(session.user.role as any, session.user.id, keyResult, keyResult.objective)) return apiForbidden('Insufficient permissions')
  // Rich fields are allowlist-sanitised and capped before storage (stored XSS).
  const parsed = parseRetrospectiveInput(await request.json().catch(() => null))
  if (!parsed.ok) return apiBadRequest(parsed.error)
  const retro = await prisma.okrRetrospective.upsert({
    where: { keyResultId: id },
    create: {
      keyResultId: id,
      entityType: 'KEY_RESULT',
      ...parsed.data,
      autoStatsJson: {},
      authorId: session.user.id,
    },
    update: {
      ...parsed.data,
      authorId: session.user.id,
    },
  })
  await recordActivity({ entityType: 'KEY_RESULT', keyResultId: id, objectiveId: keyResult.objectiveId, action: 'UPDATED', actorId: session.user.id, metadata: { area: 'retrospective' } })
  broadcastKeyResultEvent(id, keyResult.objectiveId, OKR_REALTIME_EVENTS.UPDATED, session.user.id)
  return apiSuccess(retro, { message: 'Retrospective draft saved.' })
})
