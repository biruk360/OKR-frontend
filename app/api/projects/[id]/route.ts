import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { hasBaselineFieldWrite } from '@/lib/projects/baseline'
import { apiSuccess, apiNotFound, apiForbidden, apiValidationError, withAuth } from '@/lib/api'

/**
 * GET    /api/projects/[id] — full project with its phase→milestone→activity tree.
 * PATCH  /api/projects/[id] — update project header fields (not baseline; see C1/C2).
 * DELETE /api/projects/[id] — soft archive.
 */

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
    return exists ? apiForbidden() : apiNotFound('Project not found')
  }

  const [project, dependencies] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.id },
      include: {
        members: true,
        phases: {
          orderBy: { position: 'asc' },
          include: {
            milestones: {
              orderBy: { position: 'asc' },
              include: {
                activities: {
                  orderBy: { position: 'asc' },
                  include: { tags: true, _count: { select: { comments: true, subtasks: true } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.activityDependency.findMany({
      where: { predecessor: { milestone: { phase: { projectId: params.id } } } },
      orderBy: { id: 'asc' },
    }),
  ])

  return apiSuccess(project ? { ...project, dependencies } : null)
})

const patchSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  clientName: z.string().trim().min(2).max(100).optional(),
  status: z.enum(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  ragStatus: z.enum(['GREEN', 'AMBER', 'RED']).optional(),
  projectManagerId: z.string().optional(),
  departmentId: z.string().nullable().optional(),
  contractValue: z.number().min(0).nullable().optional(),
  currency: z.enum(['ETB', 'USD', 'EUR']).optional(),
  portalEnabled: z.boolean().optional(),
  clientEmails: z.array(z.string().email()).optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  objectiveId: z.string().nullable().optional(),
})

export const PATCH = withAuth<{ id: string }>(async (req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()

  const json = await req.json().catch(() => null)
  // Invariant #1: baseline fields are frozen — never writable here (only via C2 re-baseline).
  if (hasBaselineFieldWrite(json)) return apiForbidden('Baseline fields are frozen and can only change via formal re-baseline')
  const parsed = patchSchema.safeParse(json)
  if (!parsed.success) return apiValidationError('Invalid update payload', parsed.error.flatten())

  const data: any = { ...parsed.data }
  if (data.plannedStart) data.plannedStart = new Date(data.plannedStart)
  if (data.plannedEnd) data.plannedEnd = new Date(data.plannedEnd)

  if (data.objectiveId !== undefined && data.objectiveId !== null) {
    const objective = await prisma.objective.findUnique({ where: { id: data.objectiveId }, select: { id: true } })
    if (!objective) return apiValidationError('Objective not found')
  }

  const before = (await prisma.project.findUnique({ where: { id: params.id } })) as Record<string, any> | null
  const updated = await prisma.project.update({ where: { id: params.id }, data })

  const changes: ChangeMap = {}
  for (const key of Object.keys(parsed.data)) {
    const from = before?.[key]
    const to = (updated as Record<string, any>)[key]
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
    if (norm(from) !== norm(to)) changes[key] = { from: norm(from), to: norm(to) }
  }
  await recordActivity({
    entityType: 'PROJECT',
    projectId: params.id,
    action: 'UPDATED',
    actorId: session.user.id,
    changes: Object.keys(changes).length ? changes : null,
  })

  return apiSuccess({ id: updated.id })
})

export const DELETE = withAuth<{ id: string }>(async (_req, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: params.id }, data: { archivedAt: new Date() } })
    await recordActivity(
      { entityType: 'PROJECT', projectId: params.id, action: 'ARCHIVED', actorId: session.user.id },
      { client: tx, required: true },
    )
  })
  return apiSuccess({ id: params.id, archived: true })
})
