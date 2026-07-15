import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { recordActivity, type ChangeMap } from '@/lib/activity-log'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { sendClientReport, transitionClientReport, updateClientReportSummary } from '@/lib/projects/client-report'
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
  const report = await prisma.projectReport.findFirst({ where: { id: params.reportId, projectId: params.id } })
  if (!report) return apiNotFound('Report not found')
  return apiSuccess(report)
})

export const PATCH = withAuth<{ id: string; reportId: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return apiValidationError('Invalid report payload', parsed.error.flatten())

  const before = await prisma.projectReport.findFirst({ where: { id: params.reportId, projectId: params.id } })
  if (!before) return apiNotFound('Report not found')

  try {
    let report
    if (parsed.data.action === 'UPDATE_SUMMARY') {
      report = await updateClientReportSummary(params.reportId, parsed.data.aiSummary)
    } else if (parsed.data.action === 'SEND') {
      const result = await sendClientReport(params.reportId)
      report = result.report
    } else {
      report = await transitionClientReport(params.reportId, parsed.data.action, session.user.id)
    }

    const changes: ChangeMap = {}
    if (before.status !== report.status) changes.status = { from: before.status, to: report.status }
    if (before.aiSummary !== report.aiSummary) changes.aiSummary = { from: before.aiSummary, to: report.aiSummary }
    await recordActivity({
      entityType: 'PROJECT_REPORT',
      projectId: params.id,
      action: report.status === 'SENT' ? 'REPORT_SENT' : 'UPDATED',
      actorId: session.user.id,
      changes: Object.keys(changes).length ? changes : null,
      metadata: { reportId: params.reportId, action: parsed.data.action },
    })
    return apiSuccess(report)
  } catch (err) {
    return apiBadRequest(err instanceof Error ? err.message : String(err))
  }
})
