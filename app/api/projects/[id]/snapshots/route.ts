import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const SNAPSHOT_TYPE = 'PUBLIC_SNAPSHOT'

async function captureProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, code: true, name: true, clientName: true, plannedStart: true, plannedEnd: true,
      status: true, ragStatus: true, percentComplete: true, percentPlanned: true,
      phases: {
        orderBy: { position: 'asc' },
        select: {
          id: true, name: true, position: true, percentComplete: true,
          milestones: {
            orderBy: { position: 'asc' },
            select: {
              id: true, name: true, position: true, percentComplete: true,
              activities: {
                orderBy: { position: 'asc' },
                select: { id: true, parentActivityId: true, position: true, title: true, currentStart: true, currentEnd: true, status: true, percentComplete: true, priority: true, risk: true, isBlocked: true, isMilestone: true },
              },
            },
          },
        },
      },
    },
  })
  if (!project) return null
  const dependencies = await prisma.activityDependency.findMany({
    where: { predecessor: { milestone: { phase: { projectId } } } },
    select: { predecessorId: true, successorId: true, type: true, lagDays: true },
  })
  return { project, dependencies, capturedAt: new Date().toISOString() }
}

export const GET = withAuth<{ id: string }>(async (_req, { session, params }) => {
  if (!await getReadableProject(session, params.id)) return apiForbidden()
  const snapshots = await prisma.projectReport.findMany({ where: { projectId: params.id, type: SNAPSHOT_TYPE }, orderBy: { generatedAt: 'desc' }, select: { id: true, generatedAt: true, status: true } })
  return apiSuccess(snapshots)
})

export const POST = withAuth<{ id: string }>(async (_req, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const contentJson = await captureProject(params.id)
  if (!contentJson) return apiNotFound('Project not found')
  const now = new Date()
  const snapshot = await prisma.projectReport.create({
    data: { projectId: params.id, type: SNAPSHOT_TYPE, periodStart: now, periodEnd: now, status: 'APPROVED', contentJson, sentToEmails: [] },
    select: { id: true, generatedAt: true },
  })
  return apiSuccess(snapshot, { status: 201 })
})

export const PATCH = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const parsed = z.object({ snapshotId: z.string().min(1) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid snapshot', parsed.error.flatten())
  const contentJson = await captureProject(params.id)
  if (!contentJson) return apiNotFound('Project not found')
  const result = await prisma.projectReport.updateMany({ where: { id: parsed.data.snapshotId, projectId: params.id, type: SNAPSHOT_TYPE }, data: { contentJson, generatedAt: new Date() } })
  if (!result.count) return apiNotFound('Snapshot not found')
  return apiSuccess({ id: parsed.data.snapshotId, refreshed: true })
})

export const DELETE = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  if (!await getWritableProject(session, params.id)) return apiForbidden()
  const parsed = z.object({ snapshotId: z.string().min(1) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid snapshot', parsed.error.flatten())
  await prisma.projectReport.deleteMany({ where: { id: parsed.data.snapshotId, projectId: params.id, type: SNAPSHOT_TYPE } })
  return apiSuccess({ id: parsed.data.snapshotId, deleted: true })
})
