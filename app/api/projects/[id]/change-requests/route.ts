import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { changeRequestWhere, nextChangeRequestCode, scopeVolatilityTotal, serializeChangeRequest } from '@/lib/projects/change-requests'

const typeSchema = z.enum(['SCOPE_ADD', 'REQUIREMENT_CHANGE', 'DESCOPE'])

const createSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(4000),
  type: typeSchema,
  requestedBy: z.string().trim().min(2).max(200),
  requestedByParty: z.enum(['CLIENT', '360GROUND']),
  requestDate: z.string().optional(),
  scheduleImpactDays: z.number().min(0).max(365).optional(),
  costImpact: z.number().min(0).optional(),
  affectedActivityIds: z.array(z.string()).default([]),
  clientSignOff: z.boolean().optional(),
})

export const GET = withAuth<{ id: string }>(async (req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const sp = new URL(req.url).searchParams
  const reportPending = sp.get('reportPending') === 'true'
  const items = await prisma.changeRequest.findMany({
    where: changeRequestWhere(params.id, { reportPending }),
    orderBy: { createdAt: 'desc' },
  })
  return apiSuccess({
    rows: items.map(serializeChangeRequest),
    scopeVolatilityDays: scopeVolatilityTotal(items),
  })
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid change request payload', parsed.error.flatten())
  const input = parsed.data

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!project) return apiNotFound('Project not found')

  const validActivityIds = input.affectedActivityIds.length
    ? await prisma.activity.findMany({
        where: { id: { in: input.affectedActivityIds }, milestone: { phase: { projectId: params.id } } },
        select: { id: true },
      })
    : []
  const affectedActivityIds = validActivityIds.map((a) => a.id)

  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.changeRequest.count({ where: { projectId: params.id } })
    return tx.changeRequest.create({
      data: {
        projectId: params.id,
        crCode: nextChangeRequestCode(count),
        title: input.title,
        description: input.description,
        type: input.type,
        requestedBy: input.requestedBy,
        requestedByParty: input.requestedByParty,
        requestDate: input.requestDate ? new Date(input.requestDate) : new Date(),
        scheduleImpactDays: input.scheduleImpactDays ?? 0,
        costImpact: input.costImpact ?? 0,
        affectedActivityIds,
        clientSignOff: input.clientSignOff ?? false,
        clientSignOffAt: input.clientSignOff ? new Date() : null,
      },
    })
  })

  await recordActivity({
    entityType: 'PROJECT_CHANGE_REQUEST',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { changeRequestId: created.id, crCode: created.crCode, affectedActivityIds },
  })

  return apiSuccess(serializeChangeRequest(created), { status: 201 })
})
