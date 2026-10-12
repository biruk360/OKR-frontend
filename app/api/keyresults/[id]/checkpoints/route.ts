import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { keyResultLockResponse } from '@/lib/okr/lock-guard'
import {
  apiBadRequest,
  apiConflict,
  apiForbidden,
  apiNotFound,
  apiSuccess,
  apiValidationError,
  withAuth,
} from '@/lib/api'
import { broadcastKeyResultEvent } from '@/lib/pusher'
import { OKR_REALTIME_EVENTS } from '@/lib/okr/realtime'
import {
  MAX_CHECKPOINTS_PER_KR,
  checkpointIssueMessage,
  createCheckpointSchema,
} from '@/features/key-results/components/checkpoints/checkpoint-schema'
import {
  auditCheckpointEvent,
  buildCheckpointsPayload,
  checkpointDTOs,
  loadCheckpointKr,
  resolveCheckpointAccess,
} from './_lib/checkpoints.server'

/**
 * GET /api/keyresults/[id]/checkpoints — KRX-3/4 payload: checkpoints (due date
 * ascending), next checkpoint id, the KRX definition and the viewer's permissions.
 * A redacted viewer gets an empty list and no definition.
 */
export const GET = withAuth<RouteIdParams>(async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const kr = await loadCheckpointKr(id)
  if (!kr) return apiNotFound('Key result not found')

  const access = await resolveCheckpointAccess(session, kr)
  if (!access.canView) return apiForbidden('Access denied')

  return apiSuccess(await buildCheckpointsPayload(session, kr, access))
})

/**
 * POST /api/keyresults/[id]/checkpoints — add a checkpoint.
 * Body: { label, dueDate, targetText, targetValue?, actualValue?, status? }.
 * KR edit permission; 423 when the KR or its objective is closed.
 */
export const POST = withAuth<RouteIdParams>(async (request: NextRequest, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid key result id')

  const body = await request.json().catch(() => null)
  const parsed = createCheckpointSchema.safeParse(body ?? {})
  if (!parsed.success) return apiValidationError(checkpointIssueMessage(parsed.error), parsed.error.issues)
  const input = parsed.data

  const kr = await loadCheckpointKr(id)
  if (!kr) return apiNotFound('Key result not found')

  const locked = await keyResultLockResponse(id)
  if (locked) return locked

  const access = await resolveCheckpointAccess(session, kr)
  if (!access.canView || !access.canEdit) {
    return apiForbidden('Insufficient permissions to edit this key result')
  }
  if (kr.status !== 'ACTIVE') return apiBadRequest('Checkpoints can only be changed on active key results')

  const existing = await prisma.keyResultCheckpoint.findMany({
    where: { keyResultId: id },
    select: { label: true },
  })
  if (existing.length >= MAX_CHECKPOINTS_PER_KR) {
    return apiBadRequest(`A key result can have at most ${MAX_CHECKPOINTS_PER_KR} checkpoints`)
  }
  const wanted = input.label.toLowerCase()
  if (existing.some((c) => c.label.trim().toLowerCase() === wanted)) {
    return apiConflict(`A checkpoint labelled "${input.label}" already exists on this key result`)
  }

  const status = input.status ?? 'PENDING'
  const reviewed = status !== 'PENDING'
  const created = await prisma.keyResultCheckpoint.create({
    data: {
      keyResultId: id,
      label: input.label,
      dueDate: input.dueDate,
      targetText: input.targetText,
      targetValue: input.targetValue ?? null,
      actualValue: input.actualValue ?? null,
      status,
      reviewedAt: reviewed ? new Date() : null,
      reviewedById: reviewed ? session.user.id : null,
    },
  })

  await auditCheckpointEvent(
    { kr, checkpointId: created.id, label: created.label, actorId: session.user.id },
    'CREATED',
  )
  broadcastKeyResultEvent(id, kr.objectiveId, OKR_REALTIME_EVENTS.UPDATED, session.user.id)

  const [dto] = await checkpointDTOs([created])
  return apiSuccess(dto, { status: 201, message: 'Checkpoint added' })
})
