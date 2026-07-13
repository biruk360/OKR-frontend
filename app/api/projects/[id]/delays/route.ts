import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { listDelayLedger } from '@/lib/projects/delay-ledger'
import { apiSuccess, apiForbidden, apiNotFound, apiValidationError, withAuth } from '@/lib/api'

/**
 * GET   /api/projects/[id]/delays — the Delay Ledger (C5): filtered rows +
 *         SERVER-computed owner totals (computed over the filtered set) + facets.
 * PATCH /api/projects/[id]/delays — edit one delay event's recovery plan/owner/date.
 */

const patchSchema = z.object({
  delayId: z.string(),
  recoveryPlan: z.string().max(2000).nullable().optional(),
  recoveryOwner: z.string().max(100).nullable().optional(),
  recoveryDate: z.string().nullable().optional(),
})

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const sp = req.nextUrl.searchParams
  const result = await listDelayLedger(prisma, params.id, {
    owner: sp.get('owner') || undefined,
    reason: sp.get('reason') || undefined,
    phase: sp.get('phase') || undefined,
  })
  return apiSuccess(result)
})

export const PATCH = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid delay payload', parsed.error.flatten())
  const input = parsed.data

  const existing = await prisma.delayEvent.findFirst({ where: { id: input.delayId, projectId: params.id } })
  if (!existing) return apiNotFound('Delay event not found')

  const data: { recoveryPlan?: string | null; recoveryOwner?: string | null; recoveryDate?: Date | null } = {}
  if (input.recoveryPlan !== undefined) data.recoveryPlan = input.recoveryPlan
  if (input.recoveryOwner !== undefined) data.recoveryOwner = input.recoveryOwner
  if (input.recoveryDate !== undefined) data.recoveryDate = input.recoveryDate ? new Date(input.recoveryDate) : null

  const updated = await prisma.delayEvent.update({ where: { id: input.delayId }, data })

  const changes: ChangeMap = {}
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
  for (const k of Object.keys(data) as (keyof typeof data)[]) {
    if (norm(existing[k]) !== norm(updated[k])) changes[k] = { from: norm(existing[k]), to: norm(updated[k]) }
  }
  await recordActivity({
    entityType: 'PROJECT_DELAY_EVENT',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    changes: Object.keys(changes).length ? changes : null,
    metadata: { delayId: input.delayId },
  })

  return apiSuccess({ id: updated.id })
})
