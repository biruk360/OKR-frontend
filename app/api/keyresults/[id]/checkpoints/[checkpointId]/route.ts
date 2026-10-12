import { NextRequest, NextResponse } from 'next/server'
import type { KeyResultCheckpoint } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
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
  checkpointIssueMessage,
  updateCheckpointSchema,
} from '@/features/key-results/components/checkpoints/checkpoint-schema'
import {
  auditCheckpointEvent,
  auditCheckpointUpdate,
  checkpointDTOs,
  loadCheckpointKr,
  resolveCheckpointAccess,
  type CheckpointKr,
} from '../_lib/checkpoints.server'
import type { Session } from 'next-auth'

type CheckpointRouteParams =
  | { id: string; checkpointId: string }
  | Promise<{ id: string; checkpointId: string }>

/**
 * Shared guard for PATCH / DELETE: KR exists, lock (423), KR edit permission,
 * active KR, and the checkpoint belongs to this KR.
 */
type WriteTarget =
  | { ok: false; error: NextResponse }
  | { ok: true; kr: CheckpointKr; checkpoint: KeyResultCheckpoint }

async function loadForWrite(session: Session, keyResultId: string, checkpointId: string): Promise<WriteTarget> {
  const kr = await loadCheckpointKr(keyResultId)
  if (!kr) return { ok: false, error: apiNotFound('Key result not found') }

  const locked = await keyResultLockResponse(keyResultId)
  if (locked) return { ok: false, error: locked }

  const access = await resolveCheckpointAccess(session, kr)
  if (!access.canView || !access.canEdit) {
    return { ok: false, error: apiForbidden('Insufficient permissions to edit this key result') }
  }
  if (kr.status !== 'ACTIVE') {
    return { ok: false, error: apiBadRequest('Checkpoints can only be changed on active key results') }
  }

  const checkpoint = await prisma.keyResultCheckpoint.findUnique({ where: { id: checkpointId } })
  if (!checkpoint || checkpoint.keyResultId !== keyResultId) {
    return { ok: false, error: apiNotFound('Checkpoint not found') }
  }
  return { ok: true, kr, checkpoint }
}

/**
 * PATCH /api/keyresults/[id]/checkpoints/[checkpointId] — edit any subset of
 * { label, dueDate, targetText, targetValue, actualValue, status }. Moving to
 * MET / MISSED stamps reviewedAt / reviewedById; back to PENDING clears them.
 */
export const PATCH = withAuth<CheckpointRouteParams>(async (request: NextRequest, { session, params }) => {
  const { id, checkpointId } = await resolveParams(params)
  if (!id || !checkpointId) return apiBadRequest('Invalid checkpoint id')

  const body = await request.json().catch(() => null)
  const parsed = updateCheckpointSchema.safeParse(body ?? {})
  if (!parsed.success) return apiValidationError(checkpointIssueMessage(parsed.error), parsed.error.issues)
  const input = parsed.data

  const loaded = await loadForWrite(session, id, checkpointId)
  if (!loaded.ok) return loaded.error
  const { kr, checkpoint } = loaded

  if (input.label !== undefined && input.label.toLowerCase() !== checkpoint.label.trim().toLowerCase()) {
    const wanted = input.label.toLowerCase()
    const siblings = await prisma.keyResultCheckpoint.findMany({
      where: { keyResultId: id, NOT: { id: checkpointId } },
      select: { label: true },
    })
    if (siblings.some((c) => c.label.trim().toLowerCase() === wanted)) {
      return apiConflict(`A checkpoint labelled "${input.label}" already exists on this key result`)
    }
  }

  const statusChanged = input.status !== undefined && input.status !== checkpoint.status
  const review = statusChanged
    ? input.status === 'PENDING'
      ? { reviewedAt: null, reviewedById: null }
      : { reviewedAt: new Date(), reviewedById: session.user.id }
    : {}

  const updated = await prisma.keyResultCheckpoint.update({
    where: { id: checkpointId },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
      ...(input.targetText !== undefined && { targetText: input.targetText }),
      ...(input.targetValue !== undefined && { targetValue: input.targetValue }),
      ...(input.actualValue !== undefined && { actualValue: input.actualValue }),
      ...(input.status !== undefined && { status: input.status }),
      ...review,
    },
  })

  await auditCheckpointUpdate(
    { kr, checkpointId, label: updated.label, actorId: session.user.id },
    checkpoint as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
  )
  broadcastKeyResultEvent(id, kr.objectiveId, OKR_REALTIME_EVENTS.UPDATED, session.user.id)

  const [dto] = await checkpointDTOs([updated])
  return apiSuccess(dto, { message: 'Checkpoint updated' })
})

/** DELETE /api/keyresults/[id]/checkpoints/[checkpointId]. */
export const DELETE = withAuth<CheckpointRouteParams>(async (_request, { session, params }) => {
  const { id, checkpointId } = await resolveParams(params)
  if (!id || !checkpointId) return apiBadRequest('Invalid checkpoint id')

  const loaded = await loadForWrite(session, id, checkpointId)
  if (!loaded.ok) return loaded.error
  const { kr, checkpoint } = loaded

  await prisma.keyResultCheckpoint.delete({ where: { id: checkpointId } })

  await auditCheckpointEvent(
    { kr, checkpointId, label: checkpoint.label, actorId: session.user.id },
    'DELETED',
  )
  broadcastKeyResultEvent(id, kr.objectiveId, OKR_REALTIME_EVENTS.UPDATED, session.user.id)

  return apiSuccess({ id: checkpointId }, { message: 'Checkpoint deleted' })
})
