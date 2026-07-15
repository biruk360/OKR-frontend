import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getWritableProject } from '@/lib/projects/access'
import { serializeClientObligation, updateApprovalObligationCompliance } from '@/lib/projects/client-obligations'

const patchSchema = z.object({
  obligation: z.string().trim().min(3).max(300).optional(),
  type: z.enum(['APPROVAL', 'AVAILABILITY', 'DATA', 'ACCESS', 'DECISION', 'ENVIRONMENT']).optional(),
  responsiblePerson: z.string().trim().min(2).max(200).optional(),
  responsibleEmail: z.string().email().nullable().optional(),
  slaBusinessDays: z.number().int().min(1).max(60).optional(),
  isContractual: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const PATCH = withAuth<{ id: string; obligationId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid client obligation payload', parsed.error.flatten())

  const existing = await prisma.clientObligation.findFirst({ where: { id: params.obligationId, projectId: params.id } })
  if (!existing) return apiNotFound('Client obligation not found')

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.clientObligation.update({ where: { id: params.obligationId }, data: parsed.data })
    if (row.type === 'APPROVAL') await updateApprovalObligationCompliance(tx, params.id, row.id)
    return tx.clientObligation.findUniqueOrThrow({ where: { id: params.obligationId } })
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    changes: diffObligation(existing, updated, Object.keys(parsed.data)),
    metadata: { clientObligationId: updated.id, type: updated.type },
  })

  return apiSuccess(serializeClientObligation(updated))
})

export const DELETE = withAuth<{ id: string; obligationId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.clientObligation.findFirst({
    where: { id: params.obligationId, projectId: params.id },
    select: { id: true, obligation: true, type: true },
  })
  if (!existing) return apiNotFound('Client obligation not found')

  const breachCount = await prisma.approvalSlaBreach.count({ where: { obligationId: params.obligationId } })
  if (breachCount > 0) return apiBadRequest('Obligations with SLA breach history cannot be deleted')

  await prisma.clientObligation.delete({ where: { id: params.obligationId } })
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { clientObligationId: existing.id, obligation: existing.obligation, type: existing.type },
  })
  return apiSuccess({ id: params.obligationId, deleted: true })
})

function diffObligation(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const field of fields) {
    const from = before[field]
    const to = after[field]
    if (from !== to) changes[field] = { from, to }
  }
  return Object.keys(changes).length ? changes : null
}
