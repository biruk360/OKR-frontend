import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { apiSuccess, apiForbidden, apiValidationError, withAuth } from '@/lib/api'

/** POST /api/projects/[id]/phases — add a phase (B1). */

const schema = z.object({
  name: z.string().trim().min(2).max(200),
  weight: z.number().min(0).max(100).optional(),
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid phase payload', parsed.error.flatten())

  const maxPos = await prisma.phase.aggregate({ where: { projectId: params.id }, _max: { position: true } })
  const phaseId = await prisma.$transaction(async (tx) => {
    const created = await tx.phase.create({
      data: { projectId: params.id, name: parsed.data.name, weight: parsed.data.weight ?? 0, position: (maxPos._max.position ?? -1) + 1 },
      select: { id: true },
    })
    await recalcProjectRollup(tx, params.id)
    return created.id
  })

  await recordActivity({ entityType: 'PROJECT_PHASE', projectId: params.id, action: 'CREATED', actorId: session.user.id, metadata: { phaseId, name: parsed.data.name } })
  return apiSuccess({ id: phaseId }, { status: 201 })
})
