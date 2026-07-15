import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { parseWhys, serializeCoe, validateCoeClosure } from '@/lib/projects/coe'

const coeWhysSchema = z.array(z.object({
  why: z.string().trim().max(500),
  answer: z.string().trim().max(2000),
})).max(10)

const patchSchema = z.object({
  trigger: z.string().trim().min(3).max(500).optional(),
  daysLost: z.number().min(0).max(9999).optional(),
  costImpact: z.number().min(0).max(999999999).nullable().optional(),
  timeline: z.string().trim().min(3).max(5000).optional(),
  whys: coeWhysSchema.optional(),
  rootCauseClass: z.enum(['PLANNING', 'REQUIREMENTS', 'APPROVAL', 'IMPLEMENTATION', 'ESTIMATION', 'EXTERNAL']).optional(),
  systemicFix: z.string().trim().max(5000).optional(),
  fixOwnerId: z.string().min(1).optional(),
  fixDueDate: z.string().datetime().optional(),
  fixStatus: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).optional(),
  fedIntoTemplate: z.boolean().optional(),
})

export const PATCH = withAuth<{ id: string; coeId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid COE payload', parsed.error.flatten())

  const existing = await prisma.correctionOfError.findFirst({ where: { id: params.coeId, projectId: params.id } })
  if (!existing) return apiNotFound('COE not found')

  const patch = parsed.data
  const nextWhys = patch.whys ? parseWhys(patch.whys) : parseWhys(existing.whys)
  const nextFixStatus = patch.fixStatus ?? existing.fixStatus
  const nextSystemicFix = patch.systemicFix ?? existing.systemicFix
  const closure = validateCoeClosure({ fixStatus: nextFixStatus as 'OPEN' | 'IN_PROGRESS' | 'DONE', whys: nextWhys, systemicFix: nextSystemicFix })
  if (!closure.ok) return apiValidationError(closure.error)

  const data: Record<string, unknown> = { ...patch }
  if (patch.whys) data.whys = nextWhys as unknown as Prisma.InputJsonValue
  if (patch.fixDueDate) data.fixDueDate = new Date(patch.fixDueDate)
  if (patch.fixStatus) data.closedAt = patch.fixStatus === 'DONE' ? new Date() : null

  const updated = await prisma.correctionOfError.update({
    where: { id: params.coeId },
    data,
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    changes: diffCoe(existing, updated, Object.keys(data)),
    metadata: { coeId: updated.id, coeCode: updated.coeCode, fixStatus: updated.fixStatus },
  })

  return apiSuccess(serializeCoe(updated))
})

export const DELETE = withAuth<{ id: string; coeId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.correctionOfError.findFirst({
    where: { id: params.coeId, projectId: params.id },
    select: { id: true, coeCode: true, fixStatus: true },
  })
  if (!existing) return apiNotFound('COE not found')

  await prisma.correctionOfError.delete({ where: { id: params.coeId } })
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { coeId: existing.id, coeCode: existing.coeCode, fixStatus: existing.fixStatus },
  })
  return apiSuccess({ id: params.coeId, deleted: true })
})

function diffCoe(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const field of fields) {
    const from = normalize(before[field])
    const to = normalize(after[field])
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to }
  }
  return Object.keys(changes).length ? changes : null
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  return value
}
