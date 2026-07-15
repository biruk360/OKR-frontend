import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { updatePerformanceReportInsights } from '@/lib/projects/performance-reports'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const patchSchema = z.object({
  teamInsight: z.string().trim().max(1000).optional(),
  individualInsights: z.record(z.string(), z.string().trim().max(1000)).optional(),
})

export const GET = withAuth<{ id: string; reportId: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const report = await prisma.projectReport.findFirst({ where: { id: params.reportId, projectId: params.id, type: { in: ['INDIVIDUAL', 'TEAM'] } } })
  if (!report) return apiNotFound('Performance report not found')
  return apiSuccess(report)
})

export const PATCH = withAuth<{ id: string; reportId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid insight payload', parsed.error.flatten())
  try {
    const report = await updatePerformanceReportInsights(params.reportId, parsed.data)
    await recordActivity({
      entityType: 'PROJECT_REPORT',
      projectId: params.id,
      action: 'UPDATED',
      actorId: session.user.id,
      metadata: { reportId: params.reportId, type: report.type, editedInsight: true },
    })
    return apiSuccess(report)
  } catch (err) {
    return apiBadRequest(err instanceof Error ? err.message : String(err))
  }
})
