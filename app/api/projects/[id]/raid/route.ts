import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { recomputeProjectHealth } from '@/lib/projects/health'
import { computeRaidScore, nextRaidRefCode, raidItemWhere, serializeRaidItem } from '@/lib/projects/raid'

const typeSchema = z.enum(['RISK', 'ASSUMPTION', 'ISSUE', 'DEPENDENCY'])
const statusSchema = z.enum(['OPEN', 'MITIGATING', 'CLOSED', 'REALISED'])

const createSchema = z.object({
  type: typeSchema,
  title: z.string().trim().min(3).max(200),
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
  status: statusSchema.optional(),
  clientVisible: z.boolean().optional(),
  reviewDate: z.string().nullable().optional(),
})

export const GET = withAuth<{ id: string }>(async (req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const sp = new URL(req.url).searchParams
  const type = typeSchema.safeParse(sp.get('type') || undefined)
  if (!type.success && sp.get('type')) return apiValidationError('Invalid RAID type', type.error.flatten())

  const items = await prisma.raidItem.findMany({
    where: raidItemWhere(params.id, { type: type.success ? type.data : undefined }),
    orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
  })
  return apiSuccess(await hydrateRaidItems(items))
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid RAID payload', parsed.error.flatten())
  const input = parsed.data

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, projectManagerId: true },
  })
  if (!project) return apiNotFound('Project not found')

  const score = input.type === 'RISK' ? computeRaidScore(input.probability, input.impact) : null
  const created = await prisma.$transaction(async (tx) => {
    const refCode = await nextRaidRefCode(tx, params.id, input.type)
    return tx.raidItem.create({
      data: {
        projectId: params.id,
        type: input.type,
        refCode,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        probability: input.type === 'RISK' ? input.probability ?? null : null,
        impact: input.type === 'RISK' ? input.impact ?? null : null,
        score,
        mitigation: input.type === 'RISK' ? input.mitigation ?? null : null,
        contingency: input.type === 'RISK' ? input.contingency ?? null : null,
        severity: input.type === 'ISSUE' ? input.severity ?? 'MEDIUM' : null,
        resolution: input.type === 'ISSUE' ? input.resolution ?? null : null,
        dependsOnParty: input.type === 'DEPENDENCY' ? input.dependsOnParty ?? null : null,
        neededByDate: input.type === 'DEPENDENCY' && input.neededByDate ? new Date(input.neededByDate) : null,
        validated: input.type === 'ASSUMPTION' ? input.validated ?? false : null,
        validatedAt: input.type === 'ASSUMPTION' && input.validated ? new Date() : null,
        impactIfFalse: input.type === 'ASSUMPTION' ? input.impactIfFalse ?? null : null,
        ownerId: input.ownerId ?? null,
        status: input.status ?? 'OPEN',
        clientVisible: input.clientVisible ?? false,
        reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
      },
    })
  })

  await recordActivity({
    entityType: 'PROJECT_RAID_ITEM',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { raidItemId: created.id, refCode: created.refCode, type: created.type, score: created.score },
  })

  if (created.type === 'RISK' && (created.score ?? 0) >= 15) {
    await emit('RAID_HIGH_RISK_ADDED', {
      actorId: session.user.id,
      entityType: 'PROJECT',
      entityId: params.id,
      entityTitle: project.name,
      explicitRecipients: [project.projectManagerId],
      data: { raidItemId: created.id, refCode: created.refCode, score: created.score, deepLink: `/dashboard/projects/${params.id}` },
    })
  }
  await recomputeProjectHealth(params.id)

  return apiSuccess((await hydrateRaidItems([created]))[0], { status: 201 })
})

async function hydrateRaidItems(items: Awaited<ReturnType<typeof prisma.raidItem.findMany>>) {
  const ownerIds = Array.from(new Set(items.map((i) => i.ownerId).filter(Boolean) as string[]))
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true, avatar: true } })
    : []
  const byId = new Map(owners.map((o) => [o.id, o]))
  return items.map((item) => ({
    ...serializeRaidItem(item),
    owner: item.ownerId ? byId.get(item.ownerId) ?? null : null,
  }))
}
