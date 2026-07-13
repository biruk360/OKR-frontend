import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { recalcProjectRollup } from '@/lib/projects/rollup'
import { apiSuccess, apiForbidden, apiBadRequest, apiValidationError, withAuth } from '@/lib/api'

/** POST /api/projects/[id]/milestones — add a milestone under a phase (B1). */

const schema = z.object({
  phaseId: z.string().min(1),
  name: z.string().trim().min(2).max(200),
  weight: z.number().min(0).max(100).optional(),
  isKeyMilestone: z.boolean().optional(),
  keyResultId: z.string().nullable().optional(), // OKR link (K1)
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid milestone payload', parsed.error.flatten())

  const phase = await prisma.phase.findFirst({ where: { id: parsed.data.phaseId, projectId: params.id }, select: { id: true } })
  if (!phase) return apiBadRequest('Phase does not belong to this project')

  const maxPos = await prisma.milestone.aggregate({ where: { phaseId: parsed.data.phaseId }, _max: { position: true } })
  const milestoneId = await prisma.$transaction(async (tx) => {
    const created = await tx.milestone.create({
      data: {
        phaseId: parsed.data.phaseId,
        name: parsed.data.name,
        weight: parsed.data.weight ?? 0,
        isKeyMilestone: parsed.data.isKeyMilestone ?? false,
        keyResultId: parsed.data.keyResultId ?? null,
        position: (maxPos._max.position ?? -1) + 1,
      },
      select: { id: true },
    })
    await recalcProjectRollup(tx, params.id)
    return created.id
  })

  await recordActivity({ entityType: 'PROJECT_MILESTONE', projectId: params.id, action: 'CREATED', actorId: session.user.id, metadata: { milestoneId, name: parsed.data.name } })
  return apiSuccess({ id: milestoneId }, { status: 201 })
})
