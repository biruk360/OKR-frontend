import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { computeRebaselineDiff, rebaseline } from '@/lib/projects/baseline'
import { emit } from '@/lib/notifications'
import { apiSuccess, apiBadRequest, apiConflict, apiForbidden, apiValidationError, withAuth } from '@/lib/api'

/**
 * GET  /api/projects/[id]/baseline/rebaseline — diff preview (old→new per changed activity).
 * POST /api/projects/[id]/baseline/rebaseline — formal re-baseline (C2).
 *
 * Re-baselining is a formal, logged, reason-required event: `baselineVersion`
 * increments, a NEW BaselineSnapshot is written (prior versions preserved — never
 * overwritten, so variance vs v1 stays computable), and the CEO is notified.
 * Audit + notification fire AFTER the transaction commits (Standing Rule #1).
 */

const postSchema = z.object({
  reason: z.string().trim().min(20, 'A reason of at least 20 characters is required').max(2000),
  approverId: z.string().optional(),
})

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  if (!access.baselineCommittedAt) return apiConflict('No baseline committed yet')

  const activities = await prisma.activity.findMany({
    where: { milestone: { phase: { projectId: params.id } } },
    select: {
      id: true,
      title: true,
      baselineStart: true,
      baselineEnd: true,
      currentStart: true,
      currentEnd: true,
      milestone: { select: { phase: { select: { name: true } } } },
    },
    orderBy: [{ milestone: { phase: { position: 'asc' } } }, { milestone: { position: 'asc' } }, { position: 'asc' }],
  })

  const changes = computeRebaselineDiff(
    activities.map((a) => ({ ...a, phaseName: a.milestone.phase.name }))
  )

  return apiSuccess({ changes })
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  if (!access.baselineCommittedAt) return apiConflict('No baseline committed yet — commit one first')

  const parsed = postSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid re-baseline payload', parsed.error.flatten())

  // Approver defaults to an EXECUTIVE (CEO) when not specified.
  let approverId = parsed.data.approverId
  if (approverId) {
    const approver = await prisma.user.findUnique({ where: { id: approverId }, select: { id: true } })
    if (!approver) return apiBadRequest('Approver not found')
  } else {
    const exec = await prisma.user.findFirst({ where: { role: 'EXECUTIVE' }, select: { id: true } })
    approverId = exec?.id ?? session.user.id
  }

  const result = await prisma.$transaction((tx) =>
    rebaseline(tx, params.id, { actorId: session.user.id, approverId: approverId!, reason: parsed.data.reason })
  )

  // Post-commit side effects.
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'REBASELINED',
    actorId: session.user.id,
    metadata: {
      version: result.version,
      reason: parsed.data.reason,
      approverId,
      changeCount: result.changes.length,
      snapshotId: result.snapshotId,
    },
  })
  await emit('PROJECT_REBASELINED', {
    actorId: session.user.id,
    entityType: 'PROJECT',
    entityId: params.id,
    data: {
      version: result.version,
      reason: parsed.data.reason,
      approverId,
      changeCount: result.changes.length,
      deepLink: `/dashboard/projects/${params.id}`,
    },
  })

  return apiSuccess({
    baselineVersion: result.version,
    changeCount: result.changes.length,
    changes: result.changes,
    snapshotId: result.snapshotId,
  })
})
