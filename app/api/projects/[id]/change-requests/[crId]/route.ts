import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { getWritableProject } from '@/lib/projects/access'
import { applyApprovedChangeRequest, canTransitionChangeRequest, serializeChangeRequest } from '@/lib/projects/change-requests'
import { recomputeProjectHealth } from '@/lib/projects/health'

type ApprovalResult = { delayEventId: string | null; shiftedActivityIds: string[] }

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().min(1).max(4000).optional(),
  type: z.enum(['SCOPE_ADD', 'REQUIREMENT_CHANGE', 'DESCOPE']).optional(),
  requestedBy: z.string().trim().min(2).max(200).optional(),
  requestedByParty: z.enum(['CLIENT', '360GROUND']).optional(),
  requestDate: z.string().optional(),
  scheduleImpactDays: z.number().min(0).max(365).optional(),
  costImpact: z.number().min(0).optional(),
  affectedActivityIds: z.array(z.string()).optional(),
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED']).optional(),
  approvedById: z.string().nullable().optional(),
  clientSignOff: z.boolean().optional(),
  rejectionReason: z.string().trim().max(2000).nullable().optional(),
})

export const PATCH = withAuth<{ id: string; crId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid change request payload', parsed.error.flatten())
  const input = parsed.data

  const existing = await prisma.changeRequest.findFirst({ where: { id: params.crId, projectId: params.id } })
  if (!existing) return apiNotFound('Change request not found')

  if (input.status && !canTransitionChangeRequest(existing.status, input.status)) {
    return apiBadRequest(`Cannot transition CR from ${existing.status} to ${input.status}`)
  }
  if (input.status === 'REJECTED' && !input.rejectionReason?.trim()) {
    return apiBadRequest('A rejection reason is required')
  }

  const data: Record<string, unknown> = {}
  for (const key of ['title', 'description', 'type', 'requestedBy', 'requestedByParty', 'scheduleImpactDays', 'costImpact', 'rejectionReason'] as const) {
    if (input[key] !== undefined) data[key] = input[key]
  }
  if (input.requestDate !== undefined) data.requestDate = new Date(input.requestDate)
  if (input.clientSignOff !== undefined) {
    data.clientSignOff = input.clientSignOff
    data.clientSignOffAt = input.clientSignOff ? existing.clientSignOffAt ?? new Date() : null
  }
  if (input.affectedActivityIds !== undefined) {
    const valid = input.affectedActivityIds.length
      ? await prisma.activity.findMany({
          where: { id: { in: input.affectedActivityIds }, milestone: { phase: { projectId: params.id } } },
          select: { id: true },
        })
      : []
    data.affectedActivityIds = valid.map((a) => a.id)
  }

  let approvalResult: ApprovalResult | null = null
  const updated = await prisma.$transaction(async (tx) => {
    if (input.status === 'APPROVED') {
      if (Object.keys(data).length) await tx.changeRequest.update({ where: { id: params.crId }, data })
      approvalResult = await applyApprovedChangeRequest(tx, {
        projectId: params.id,
        changeRequestId: params.crId,
        actorId: session.user.id,
        approvedById: input.approvedById,
      })
      return tx.changeRequest.findUniqueOrThrow({ where: { id: params.crId } })
    }

    if (input.status) {
      data.status = input.status
      if (input.status === 'REJECTED') data.ccbDecisionDate = new Date()
    }
    if (input.status === 'IMPLEMENTED') data.ccbDecisionDate = existing.ccbDecisionDate ?? new Date()

    return tx.changeRequest.update({ where: { id: params.crId }, data })
  })

  const approvalMetadata = approvalResult as ApprovalResult | null
  const changes = diffChangeRequest(existing, updated, [...Object.keys(data), ...(input.status === 'APPROVED' ? ['status', 'ccbDecisionDate', 'approvedById'] : [])])
  await recordActivity({
    entityType: 'PROJECT_CHANGE_REQUEST',
    projectId: params.id,
    action: input.status ? 'STATUS_CHANGED' : 'UPDATED',
    actorId: session.user.id,
    changes,
    metadata: {
      changeRequestId: updated.id,
      crCode: updated.crCode,
      status: updated.status,
      delayEventId: approvalMetadata?.delayEventId ?? null,
      shiftedActivityIds: approvalMetadata?.shiftedActivityIds ?? [],
    },
  })

  if (input.status === 'APPROVED') {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { name: true, projectManagerId: true } })
    if (project) {
      await emit('CHANGE_REQUEST_APPROVED', {
        actorId: session.user.id,
        entityType: 'PROJECT',
        entityId: params.id,
        entityTitle: project.name,
        explicitRecipients: [project.projectManagerId],
        data: { crCode: updated.crCode, scheduleImpactDays: updated.scheduleImpactDays, deepLink: `/dashboard/projects/${params.id}` },
      })
    }
    await recomputeProjectHealth(params.id)
  }

  return apiSuccess(serializeChangeRequest(updated))
})

export const DELETE = withAuth<{ id: string; crId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.changeRequest.findFirst({
    where: { id: params.crId, projectId: params.id },
    select: { id: true, crCode: true, title: true, status: true },
  })
  if (!existing) return apiNotFound('Change request not found')
  if (existing.status === 'APPROVED' || existing.status === 'IMPLEMENTED') {
    return apiBadRequest('Approved or implemented change requests cannot be deleted')
  }

  await prisma.changeRequest.delete({ where: { id: params.crId } })
  await recordActivity({
    entityType: 'PROJECT_CHANGE_REQUEST',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { changeRequestId: existing.id, crCode: existing.crCode, title: existing.title },
  })
  return apiSuccess({ id: params.crId, deleted: true })
})

function diffChangeRequest(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const field of Array.from(new Set(fields))) {
    const from = before[field]
    const to = after[field]
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
    if (norm(from) !== norm(to)) changes[field] = { from: norm(from), to: norm(to) }
  }
  return Object.keys(changes).length ? changes : null
}
