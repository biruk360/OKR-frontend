import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { emit } from '@/lib/notifications'
import { createProjectWithTemplate } from '@/lib/projects/service'
import { apiSuccess, apiPaginated, apiBadRequest, apiValidationError, withAuth, withRole } from '@/lib/api'

/**
 * GET /api/projects — list projects visible to the requester (role-scoped).
 * POST /api/projects — create a project (A1). PM/Executive/Admin only.
 */

export const GET = withAuth(async (request: NextRequest, { session }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const ragStatus = searchParams.get('ragStatus')
  const search = searchParams.get('search')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))

  const where: any = { archivedAt: null }
  if (status) where.status = status
  if (ragStatus) where.ragStatus = ragStatus
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { clientName: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Record scoping: everyone but ADMIN/EXECUTIVE sees only projects they manage,
  // own department's, or are a member of.
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') {
    const memberships = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true },
    })
    const deptIds = memberships.map((m) => m.departmentId)
    const scope = [
      { projectManagerId: session.user.id },
      { departmentId: { in: deptIds } },
      { members: { some: { userId: session.user.id } } },
    ]
    where.AND = [{ OR: scope }]
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, code: true, name: true, clientName: true, status: true, ragStatus: true,
        confidence: true, percentComplete: true, percentPlanned: true, spi: true,
        plannedStart: true, plannedEnd: true, baselineCommittedAt: true, projectManagerId: true,
        departmentId: true, updatedAt: true,
      },
    }),
    prisma.project.count({ where }),
  ])

  return apiPaginated(projects, { page, limit, total })
})

const createSchema = z.object({
  name: z.string().trim().min(3).max(200),
  code: z.string().trim().min(3).max(40).optional(),
  clientName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).optional().nullable(),
  projectManagerId: z.string().min(1),
  departmentId: z.string().optional().nullable(),
  contractValue: z.number().min(0).optional().nullable(),
  currency: z.enum(['ETB', 'USD', 'EUR']).optional(),
  plannedStart: z.string().datetime({ offset: true }).or(z.string().date()),
  plannedEnd: z.string().datetime({ offset: true }).or(z.string().date()),
  templateId: z.string().optional().nullable(),
})

export const POST = withRole(['ADMIN', 'EXECUTIVE', 'DEPARTMENT_LEAD'], async (request: NextRequest, { session }) => {
  const json = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid project payload', parsed.error.flatten())
  const input = parsed.data

  const plannedStart = new Date(input.plannedStart)
  const plannedEnd = new Date(input.plannedEnd)
  if (Number.isNaN(plannedStart.getTime()) || Number.isNaN(plannedEnd.getTime())) {
    return apiBadRequest('Invalid start or end date')
  }
  if (plannedEnd <= plannedStart) {
    return apiBadRequest('End date must be after start date')
  }

  // Uniqueness pre-check for a friendly error (the DB unique constraint is authoritative).
  if (input.code) {
    const existing = await prisma.project.findUnique({ where: { code: input.code }, select: { id: true } })
    if (existing) return apiBadRequest(`Project code ${input.code} is already in use`)
  }

  let created: { id: string; code: string }
  try {
    created = await createProjectWithTemplate(prisma, {
      name: input.name,
      code: input.code,
      clientName: input.clientName,
      description: input.description ?? null,
      projectManagerId: input.projectManagerId,
      departmentId: input.departmentId ?? null,
      contractValue: input.contractValue ?? null,
      currency: input.currency,
      plannedStart,
      plannedEnd,
      templateId: input.templateId ?? null,
      createdById: session.user.id,
    })
  } catch (e: any) {
    if (e?.code === 'P2002') return apiBadRequest('Project code must be unique')
    throw e
  }

  await recordActivity({
    entityType: 'PROJECT',
    projectId: created.id,
    action: 'CREATED',
    actorId: session.user.id,
    metadata: { code: created.code, name: input.name, clientName: input.clientName, templateId: input.templateId ?? null },
  })

  await emit('PROJECT_CREATED', {
    actorId: session.user.id,
    entityType: 'PROJECT',
    entityId: created.id,
    entityTitle: input.name,
    data: { actorName: session.user.name, code: created.code, deepLink: `/dashboard/projects/${created.id}` },
  })

  return apiSuccess({ id: created.id, code: created.code }, { status: 201 })
})
