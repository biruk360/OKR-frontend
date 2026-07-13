import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { hasBaselineFieldWrite } from '@/lib/projects/baseline'
import { apiSuccess, apiForbidden, apiNotFound, apiValidationError, withAuth } from '@/lib/api'

/** PATCH/DELETE /api/projects/[id]/milestones/[milestoneId] (B1). */

const schema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  weight: z.number().min(0).max(100).optional(),
  position: z.number().int().min(0).optional(),
  isKeyMilestone: z.boolean().optional(),
  status: z.enum(['NOT_STARTED', 'STARTED', 'FINISHED', 'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED']).optional(),
  keyResultId: z.string().nullable().optional(),
})

export const PATCH = withAuth<{ id: string; milestoneId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const milestone = await prisma.milestone.findFirst({ where: { id: params.milestoneId, phase: { projectId: params.id } }, select: { id: true } })
  if (!milestone) return apiNotFound('Milestone not found')

  const raw = await req.json().catch(() => null)
  // Invariant #1: baseline fields are frozen — never writable here (only via C2 re-baseline).
  if (hasBaselineFieldWrite(raw)) return apiForbidden('Baseline fields are frozen and can only change via formal re-baseline')
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return apiValidationError('Invalid milestone payload', parsed.error.flatten())

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({ where: { id: params.milestoneId }, data: parsed.data })
    await recalcProjectRollup(tx, params.id)
  })
  await recordActivity({ entityType: 'PROJECT_MILESTONE', projectId: params.id, action: 'UPDATED', actorId: session.user.id, metadata: { milestoneId: params.milestoneId } })
  return apiSuccess({ id: params.milestoneId })
})

export const DELETE = withAuth<{ id: string; milestoneId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const milestone = await prisma.milestone.findFirst({ where: { id: params.milestoneId, phase: { projectId: params.id } }, select: { id: true } })
  if (!milestone) return apiNotFound('Milestone not found')

  await prisma.$transaction(async (tx) => {
    await tx.milestone.delete({ where: { id: params.milestoneId } })
    await recalcProjectRollup(tx, params.id)
  })
  await recordActivity({ entityType: 'PROJECT_MILESTONE', projectId: params.id, action: 'DELETED', actorId: session.user.id, metadata: { milestoneId: params.milestoneId } })
  return apiSuccess({ id: params.milestoneId, deleted: true })
})
