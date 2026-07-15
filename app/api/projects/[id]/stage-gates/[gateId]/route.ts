import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { parseChecklistText, serializeStageGate, validateGateTransition } from '@/lib/projects/stage-gates'

const patchSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  entryCriteria: z.union([z.string(), z.array(z.string())]).optional(),
  exitCriteria: z.union([z.string(), z.array(z.string())]).optional(),
  requiredDeliverables: z.union([z.string(), z.array(z.string())]).optional(),
  requiredApprovals: z.union([z.string(), z.array(z.string())]).optional(),
  status: z.enum(['NOT_REACHED', 'PENDING', 'PASSED', 'FAILED', 'WAIVED']).optional(),
  approvedById: z.string().nullable().optional(),
  waiverReason: z.string().trim().max(2000).nullable().optional(),
})

export const PATCH = withAuth<{ id: string; gateId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid stage-gate payload', parsed.error.flatten())
  const input = parsed.data

  const existing = await prisma.stageGate.findFirst({
    where: { id: params.gateId, projectId: params.id },
    include: { phase: { select: { id: true, name: true, position: true } } },
  })
  if (!existing) return apiNotFound('Stage gate not found')

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.entryCriteria !== undefined) data.entryCriteria = parseChecklistText(input.entryCriteria)
  if (input.exitCriteria !== undefined) data.exitCriteria = parseChecklistText(input.exitCriteria)
  if (input.requiredDeliverables !== undefined) data.requiredDeliverables = parseChecklistText(input.requiredDeliverables)
  if (input.requiredApprovals !== undefined) data.requiredApprovals = parseChecklistText(input.requiredApprovals)
  if (input.status !== undefined) {
    data.status = input.status
    if (input.status === 'PASSED') {
      data.approvedById = input.approvedById ?? session.user.id
      data.gateDate = new Date()
      data.waiverReason = null
      data.waivedById = null
    } else if (input.status === 'WAIVED') {
      data.waiverReason = input.waiverReason ?? existing.waiverReason
      data.waivedById = session.user.id
      data.gateDate = new Date()
    } else if (input.status === 'FAILED') {
      data.gateDate = new Date()
    } else {
      data.gateDate = null
      data.approvedById = null
      data.waiverReason = null
      data.waivedById = null
    }
  }

  const nextExitCriteria = (data.exitCriteria as string[] | undefined) ?? existing.exitCriteria
  const nextStatus = (data.status as any) ?? existing.status
  const nextWaiverReason = (data.waiverReason as string | null | undefined) ?? existing.waiverReason
  const validation = validateGateTransition({ status: nextStatus, exitCriteria: nextExitCriteria, waiverReason: nextWaiverReason })
  if (!validation.ok) return apiBadRequest(validation.error)

  const updated = await prisma.stageGate.update({
    where: { id: params.gateId },
    data,
    include: { phase: { select: { id: true, name: true, position: true } } },
  })
  await recordActivity({
    entityType: 'PROJECT_STAGE_GATE',
    projectId: params.id,
    action: input.status ? (input.status === 'PASSED' ? 'GATE_PASSED' : input.status === 'WAIVED' ? 'GATE_WAIVED' : 'STATUS_CHANGED') : 'UPDATED',
    actorId: session.user.id,
    changes: diffGate(existing, updated, Object.keys(data)),
    metadata: { gateId: updated.id, phaseId: updated.phaseId, status: updated.status },
  })
  return apiSuccess(serializeStageGate(updated))
})

export const DELETE = withAuth<{ id: string; gateId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.stageGate.findFirst({
    where: { id: params.gateId, projectId: params.id },
    select: { id: true, name: true, phaseId: true },
  })
  if (!existing) return apiNotFound('Stage gate not found')

  await prisma.stageGate.delete({ where: { id: params.gateId } })
  await recordActivity({
    entityType: 'PROJECT_STAGE_GATE',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { gateId: existing.id, phaseId: existing.phaseId, name: existing.name },
  })
  return apiSuccess({ id: params.gateId, deleted: true })
})

function diffGate(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const field of fields) {
    const from = before[field]
    const to = after[field]
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
    if (JSON.stringify(norm(from)) !== JSON.stringify(norm(to))) changes[field] = { from: norm(from), to: norm(to) }
  }
  return Object.keys(changes).length ? changes : null
}
