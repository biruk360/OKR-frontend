import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { hasBaselineFieldWrite } from '@/lib/projects/baseline'
import { apiSuccess, apiForbidden, apiNotFound, apiValidationError, withAuth } from '@/lib/api'

/** PATCH/DELETE /api/projects/[id]/phases/[phaseId] (B1). */

const schema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  weight: z.number().min(0).max(100).optional(),
  position: z.number().int().min(0).optional(),
  status: z.enum(['NOT_STARTED', 'STARTED', 'FINISHED', 'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED']).optional(),
})

export const PATCH = withAuth<{ id: string; phaseId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const phase = await prisma.phase.findFirst({ where: { id: params.phaseId, projectId: params.id }, select: { id: true } })
  if (!phase) return apiNotFound('Phase not found')

  const raw = await req.json().catch(() => null)
  // Invariant #1: baseline fields are frozen — never writable here (only via C2 re-baseline).
  if (hasBaselineFieldWrite(raw)) return apiForbidden('Baseline fields are frozen and can only change via formal re-baseline')
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return apiValidationError('Invalid phase payload', parsed.error.flatten())

  await prisma.$transaction(async (tx) => {
    await tx.phase.update({ where: { id: params.phaseId }, data: parsed.data })
    await recalcProjectRollup(tx, params.id)
  })
  await recordActivity({ entityType: 'PROJECT_PHASE', projectId: params.id, action: 'UPDATED', actorId: session.user.id, metadata: { phaseId: params.phaseId } })
  return apiSuccess({ id: params.phaseId })
})

export const DELETE = withAuth<{ id: string; phaseId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const phase = await prisma.phase.findFirst({ where: { id: params.phaseId, projectId: params.id }, select: { id: true } })
  if (!phase) return apiNotFound('Phase not found')

  await prisma.$transaction(async (tx) => {
    await tx.phase.delete({ where: { id: params.phaseId } })
    await recalcProjectRollup(tx, params.id)
  })
  await recordActivity({ entityType: 'PROJECT_PHASE', projectId: params.id, action: 'DELETED', actorId: session.user.id, metadata: { phaseId: params.phaseId } })
  return apiSuccess({ id: params.phaseId, deleted: true })
})
