import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { clientHealthScore, clientHealthTone, clientObligationWhere, serializeClientObligation } from '@/lib/projects/client-obligations'

const createSchema = z.object({
  obligation: z.string().trim().min(3).max(300),
  type: z.enum(['APPROVAL', 'AVAILABILITY', 'DATA', 'ACCESS', 'DECISION', 'ENVIRONMENT']),
  responsiblePerson: z.string().trim().min(2).max(200),
  responsibleEmail: z.string().email().nullable().optional(),
  slaBusinessDays: z.number().int().min(1).max(60),
  isContractual: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const GET = withAuth<{ id: string }>(async (req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const sp = new URL(req.url).searchParams
  const report = sp.get('report') === 'true'
  const obligations = await prisma.clientObligation.findMany({
    where: clientObligationWhere(params.id, { report }),
    orderBy: [{ type: 'asc' }, { obligation: 'asc' }],
  })
  const rows = obligations.map(serializeClientObligation)
  const healthScore = clientHealthScore(rows.map((row) => row.complianceRate))
  return apiSuccess({
    rows,
    clientHealthScore: healthScore,
    clientHealthTone: clientHealthTone(healthScore),
    ceoWarning: healthScore < 60,
  })
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid client obligation payload', parsed.error.flatten())
  const input = parsed.data

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!project) return apiNotFound('Project not found')

  const created = await prisma.clientObligation.create({
    data: {
      projectId: params.id,
      obligation: input.obligation,
      type: input.type,
      responsiblePerson: input.responsiblePerson,
      responsibleEmail: input.responsibleEmail ?? null,
      slaBusinessDays: input.slaBusinessDays,
      isContractual: input.isContractual ?? false,
      notes: input.notes ?? null,
    },
  })
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { clientObligationId: created.id, type: created.type, slaBusinessDays: created.slaBusinessDays },
  })

  return apiSuccess(serializeClientObligation(created), { status: 201 })
})
