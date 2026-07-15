import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { parseChecklistText, serializeStageGate, stageGateWhere, validateGateTransition } from '@/lib/projects/stage-gates'

const createSchema = z.object({
  phaseId: z.string().min(1),
  name: z.string().trim().min(3).max(200),
  entryCriteria: z.union([z.string(), z.array(z.string())]).optional(),
  exitCriteria: z.union([z.string(), z.array(z.string())]).optional(),
  requiredDeliverables: z.union([z.string(), z.array(z.string())]).optional(),
  requiredApprovals: z.union([z.string(), z.array(z.string())]).optional(),
  status: z.enum(['NOT_REACHED', 'PENDING', 'PASSED', 'FAILED', 'WAIVED']).optional(),
  approvedById: z.string().nullable().optional(),
  waiverReason: z.string().trim().max(2000).nullable().optional(),
})

export const GET = withAuth<{ id: string }>(async (req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const sp = new URL(req.url).searchParams
  const report = sp.get('report') === 'true'
  const gates = await prisma.stageGate.findMany({
    where: stageGateWhere(params.id, { report }),
    include: { phase: { select: { id: true, name: true, position: true } } },
    orderBy: { phase: { position: 'asc' } },
  })
  return apiSuccess(gates.map(serializeStageGate))
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid stage-gate payload', parsed.error.flatten())
  const input = parsed.data

  const phase = await prisma.phase.findFirst({
    where: { id: input.phaseId, projectId: params.id },
    select: { id: true, name: true },
  })
  if (!phase) return apiNotFound('Phase not found')

  const data = {
    projectId: params.id,
    phaseId: phase.id,
    name: input.name,
    entryCriteria: parseChecklistText(input.entryCriteria),
    exitCriteria: parseChecklistText(input.exitCriteria),
    requiredDeliverables: parseChecklistText(input.requiredDeliverables),
    requiredApprovals: parseChecklistText(input.requiredApprovals),
    status: input.status ?? 'PENDING',
    approvedById: input.status === 'PASSED' ? input.approvedById ?? session.user.id : null,
    waiverReason: input.status === 'WAIVED' ? input.waiverReason ?? null : null,
    waivedById: input.status === 'WAIVED' ? session.user.id : null,
    gateDate: input.status && ['PASSED', 'FAILED', 'WAIVED'].includes(input.status) ? new Date() : null,
  }
  const validation = validateGateTransition({ status: data.status as any, exitCriteria: data.exitCriteria, waiverReason: data.waiverReason })
  if (!validation.ok) return apiBadRequest(validation.error)

  const gate = await prisma.stageGate.create({ data, include: { phase: { select: { id: true, name: true, position: true } } } })
  await recordActivity({
    entityType: 'PROJECT_STAGE_GATE',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { gateId: gate.id, phaseId: phase.id, status: gate.status },
  })
  return apiSuccess(serializeStageGate(gate), { status: 201 })
})
