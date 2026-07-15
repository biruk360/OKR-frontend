import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import {
  MANAGEMENT_REPORT_TYPES,
  transitionManagementReport,
  updateManagementReportSummary,
} from '@/lib/projects/management-reports'
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('UPDATE_SUMMARY'), aiSummary: z.string().trim().min(1).max(800) }),
  z.object({ action: z.literal('SUBMIT_REVIEW') }),
  z.object({ action: z.literal('APPROVE') }),
  z.object({ action: z.literal('SEND') }),
])

export const GET = withAuth<{ id: string; reportId: string }>(async (_req, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const report = await prisma.projectReport.findFirst({
    where: { id: params.reportId, projectId: params.id, type: { in: [...MANAGEMENT_REPORT_TYPES] } },
  })
  if (!report) return apiNotFound('Management report not found')
  return apiSuccess(report)
})

export const PATCH = withAuth<{ id: string; reportId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid management report payload', parsed.error.flatten())

  const before = await prisma.projectReport.findFirst({
    where: { id: params.reportId, projectId: params.id, type: { in: [...MANAGEMENT_REPORT_TYPES] } },
  })
  if (!before) return apiNotFound('Management report not found')

  try {
    const report = parsed.data.action === 'UPDATE_SUMMARY'
      ? await updateManagementReportSummary(params.reportId, parsed.data.aiSummary)
      : await transitionManagementReport(params.reportId, parsed.data.action, session.user.id)
    const changes: ChangeMap = {}
    if (before.status !== report.status) changes.status = { from: before.status, to: report.status }
    if (before.aiSummary !== report.aiSummary) changes.aiSummary = { from: before.aiSummary, to: report.aiSummary }
    await recordActivity({
      entityType: 'PROJECT_REPORT',
      projectId: params.id,
      action: report.status === 'SENT' ? 'REPORT_SENT' : 'UPDATED',
      actorId: session.user.id,
      changes: Object.keys(changes).length ? changes : null,
      metadata: { reportId: params.reportId, type: report.type, action: parsed.data.action },
    })
    return apiSuccess(report)
  } catch (err) {
    return apiBadRequest(err instanceof Error ? err.message : String(err))
  }
})
