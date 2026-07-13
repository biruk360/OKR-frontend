import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { commitBaseline } from '@/lib/projects/baseline'
import { emit } from '@/lib/notifications'
import { apiSuccess, apiConflict, apiForbidden, apiValidationError, withAuth } from '@/lib/api'

/**
 * POST /api/projects/[id]/baseline — commit the baseline (C1).
 *
 * Freezes every Phase/Milestone/Activity's current dates as the baseline,
 * stamps the project (baselineCommittedAt + baselineVersion=1), and writes a
 * full-schedule BaselineSnapshot (v1) — all in one transaction. After commit,
 * baseline* fields are immutable (Invariant #1); the schedule PATCH routes
 * reject raw baseline-field writes with 403 (see lib/projects/baseline.ts).
 * Audit + notification fire AFTER the transaction commits (Standing Rule #1).
 */

const schema = z.object({
  notes: z.string().trim().max(1000).optional(),
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  if (access.baselineCommittedAt) {
    return apiConflict('Baseline already committed — use formal re-baseline to revise it')
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return apiValidationError('Invalid baseline payload', parsed.error.flatten())

  const result = await prisma.$transaction((tx) =>
    commitBaseline(tx, params.id, { actorId: session.user.id, notes: parsed.data.notes })
  )

  // Post-commit side effects.
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'BASELINE_COMMITTED',
    actorId: session.user.id,
    metadata: {
      version: 1,
      phaseCount: result.phaseCount,
      milestoneCount: result.milestoneCount,
      activityCount: result.activityCount,
      snapshotId: result.snapshotId,
      notes: parsed.data.notes ?? null,
    },
  })
  await emit('PROJECT_BASELINE_COMMITTED', {
    actorId: session.user.id,
    entityType: 'PROJECT',
    entityId: params.id,
    data: { version: 1, activityCount: result.activityCount, deepLink: `/dashboard/projects/${params.id}` },
  })

  return apiSuccess({
    baselineVersion: 1,
    baselineCommittedAt: result.committedAt.toISOString(),
    phaseCount: result.phaseCount,
    milestoneCount: result.milestoneCount,
    activityCount: result.activityCount,
  })
})
