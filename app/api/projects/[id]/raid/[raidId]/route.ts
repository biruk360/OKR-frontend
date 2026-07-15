import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { getWritableProject } from '@/lib/projects/access'
import { recomputeProjectHealth } from '@/lib/projects/health'
import { computeDaysOpen, computeRaidScore, serializeRaidItem } from '@/lib/projects/raid'

const patchSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  probability: z.number().int().min(1).max(5).nullable().optional(),
  impact: z.number().int().min(1).max(5).nullable().optional(),
  mitigation: z.string().trim().max(2000).nullable().optional(),
  contingency: z.string().trim().max(2000).nullable().optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).nullable().optional(),
  resolution: z.string().trim().max(2000).nullable().optional(),
  dependsOnParty: z.enum(['CLIENT', '360GROUND', 'THIRD_PARTY']).nullable().optional(),
  neededByDate: z.string().nullable().optional(),
  validated: z.boolean().nullable().optional(),
  impactIfFalse: z.string().trim().max(2000).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  status: z.enum(['OPEN', 'MITIGATING', 'CLOSED', 'REALISED']).optional(),
  clientVisible: z.boolean().optional(),
  reviewDate: z.string().nullable().optional(),
})

export const PATCH = withAuth<{ id: string; raidId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid RAID payload', parsed.error.flatten())
  const input = parsed.data

  const existing = await prisma.raidItem.findFirst({
    where: { id: params.raidId, projectId: params.id },
  })
  if (!existing) return apiNotFound('RAID item not found')

  const nextProbability = input.probability !== undefined ? input.probability : existing.probability
  const nextImpact = input.impact !== undefined ? input.impact : existing.impact
  const data: Record<string, unknown> = {}
  for (const key of ['title', 'description', 'category', 'mitigation', 'contingency', 'severity', 'resolution', 'dependsOnParty', 'impactIfFalse', 'ownerId', 'clientVisible'] as const) {
    if (input[key] !== undefined) data[key] = input[key]
  }
  if (input.probability !== undefined) data.probability = input.probability
  if (input.impact !== undefined) data.impact = input.impact
  if (input.neededByDate !== undefined) data.neededByDate = input.neededByDate ? new Date(input.neededByDate) : null
  if (input.reviewDate !== undefined) data.reviewDate = input.reviewDate ? new Date(input.reviewDate) : null
  if (input.validated !== undefined) {
    data.validated = input.validated
    data.validatedAt = input.validated ? existing.validatedAt ?? new Date() : null
  }
  if (input.status !== undefined) {
    data.status = input.status
    if (input.status === 'CLOSED' && !existing.closedAt) data.closedAt = new Date()
    if (input.status !== 'CLOSED') data.closedAt = null
  }
  if (existing.type === 'RISK' && (input.probability !== undefined || input.impact !== undefined)) {
    data.score = computeRaidScore(nextProbability, nextImpact)
  }
  if (existing.type === 'ISSUE') {
    data.daysOpen = computeDaysOpen(existing.createdAt, (data.closedAt as Date | null | undefined) ?? existing.closedAt)
  }

  const updated = await prisma.raidItem.update({ where: { id: params.raidId }, data })
  await recordActivity({
    entityType: 'PROJECT_RAID_ITEM',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    changes: diffRaid(existing, updated, Object.keys(data)),
    metadata: { raidItemId: updated.id, refCode: updated.refCode, type: updated.type },
  })

  if (updated.type === 'RISK' && (updated.score ?? 0) >= 15 && (existing.score ?? 0) < 15) {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { name: true, projectManagerId: true } })
    if (project) {
      await emit('RAID_HIGH_RISK_ADDED', {
        actorId: session.user.id,
        entityType: 'PROJECT',
        entityId: params.id,
        entityTitle: project.name,
        explicitRecipients: [project.projectManagerId],
        data: { raidItemId: updated.id, refCode: updated.refCode, score: updated.score, deepLink: `/dashboard/projects/${params.id}` },
      })
    }
  }
  await recomputeProjectHealth(params.id)

  return apiSuccess(serializeRaidItem(updated))
})

export const DELETE = withAuth<{ id: string; raidId: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const existing = await prisma.raidItem.findFirst({
    where: { id: params.raidId, projectId: params.id },
    select: { id: true, refCode: true, type: true, title: true },
  })
  if (!existing) return apiNotFound('RAID item not found')

  await prisma.raidItem.delete({ where: { id: params.raidId } })
  await recordActivity({
    entityType: 'PROJECT_RAID_ITEM',
    projectId: params.id,
    action: 'DELETED',
    actorId: session.user.id,
    metadata: { raidItemId: existing.id, refCode: existing.refCode, type: existing.type, title: existing.title },
  })
  await recomputeProjectHealth(params.id)

  return apiSuccess({ id: params.raidId, deleted: true })
})

function diffRaid(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): ChangeMap | null {
  const changes: ChangeMap = {}
  for (const field of fields) {
    const from = before[field]
    const to = after[field]
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
    if (norm(from) !== norm(to)) changes[field] = { from: norm(from), to: norm(to) }
  }
  return Object.keys(changes).length ? changes : null
}
