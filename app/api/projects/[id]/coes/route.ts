import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import {
  coeWhere,
  detectCoeTriggers,
  nextCoeCode,
  parseWhys,
  rootCausePareto,
  serializeCoe,
  validateCoeClosure,
} from '@/lib/projects/coe'

const coeWhysSchema = z.array(z.object({
  why: z.string().trim().max(500),
  answer: z.string().trim().max(2000),
})).max(10)

const createSchema = z.object({
  trigger: z.string().trim().min(3).max(500),
  daysLost: z.number().min(0).max(9999),
  costImpact: z.number().min(0).max(999999999).nullable().optional(),
  timeline: z.string().trim().min(3).max(5000),
  whys: coeWhysSchema,
  rootCauseClass: z.enum(['PLANNING', 'REQUIREMENTS', 'APPROVAL', 'IMPLEMENTATION', 'ESTIMATION', 'EXTERNAL']),
  systemicFix: z.string().trim().max(5000),
  fixOwnerId: z.string().min(1),
  fixDueDate: z.string().datetime(),
  fixStatus: z.enum(['OPEN', 'IN_PROGRESS', 'DONE']).optional(),
  fedIntoTemplate: z.boolean().optional(),
})

export const GET = withAuth<{ id: string }>(async (req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()

  const sp = new URL(req.url).searchParams
  const now = new Date()
  const report = sp.get('report') === 'true'
  const overdue = sp.get('overdue') === 'true'
  const [project, coes, milestones] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.id }, select: { id: true, ragStatus: true } }),
    prisma.correctionOfError.findMany({
      where: coeWhere(params.id, { report, overdue, now }),
      orderBy: [{ fixStatus: 'asc' }, { fixDueDate: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.milestone.findMany({
      where: { phase: { projectId: params.id }, baselineDate: { not: null }, currentDate: { not: null } },
      select: { id: true, name: true, baselineDate: true, currentDate: true },
      orderBy: [{ phase: { position: 'asc' } }, { position: 'asc' }],
    }),
  ])
  if (!project) return apiNotFound('Project not found')

  const allTriggers = await prisma.correctionOfError.findMany({
    where: { projectId: params.id },
    select: { trigger: true },
  })
  const rows = coes.map((coe) => serializeCoe(coe, now))
  return apiSuccess({
    rows,
    triggers: detectCoeTriggers({
      projectRagStatus: project.ragStatus,
      milestones,
      existingTriggers: allTriggers.map((coe) => coe.trigger),
    }),
    rootCausePareto: rootCausePareto(coes),
    overdueCount: rows.filter((coe) => coe.isOverdue).length,
    lessonsLearned: rows.filter((coe) => coe.lessonLearned).map((coe) => ({
      id: coe.id,
      coeCode: coe.coeCode,
      rootCauseClass: coe.rootCauseClass,
      systemicFix: coe.lessonLearned,
    })),
  })
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid COE payload', parsed.error.flatten())
  const input = parsed.data
  const whys = parseWhys(input.whys)
  const fixStatus = input.fixStatus ?? 'OPEN'
  const closure = validateCoeClosure({ fixStatus, whys, systemicFix: input.systemicFix })
  if (!closure.ok) return apiValidationError(closure.error)

  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!project) return apiNotFound('Project not found')

  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.correctionOfError.count({ where: { projectId: params.id } })
    return tx.correctionOfError.create({
      data: {
        projectId: params.id,
        coeCode: nextCoeCode(count),
        trigger: input.trigger,
        daysLost: input.daysLost,
        costImpact: input.costImpact ?? null,
        timeline: input.timeline,
        whys: whys as unknown as Prisma.InputJsonValue,
        rootCauseClass: input.rootCauseClass,
        systemicFix: input.systemicFix,
        fixOwnerId: input.fixOwnerId,
        fixDueDate: new Date(input.fixDueDate),
        fixStatus,
        fedIntoTemplate: input.fedIntoTemplate ?? false,
        closedAt: fixStatus === 'DONE' ? new Date() : null,
      },
    })
  })

  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { coeId: created.id, coeCode: created.coeCode, rootCauseClass: created.rootCauseClass },
  })

  return apiSuccess(serializeCoe(created), { status: 201 })
})
