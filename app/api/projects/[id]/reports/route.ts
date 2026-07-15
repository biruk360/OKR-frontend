import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { emit } from '@/lib/notifications'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { generateClientReportDraft, CLIENT_REPORT_TYPE } from '@/lib/projects/client-report'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'

const createSchema = z.object({
  type: z.literal(CLIENT_REPORT_TYPE).default(CLIENT_REPORT_TYPE),
  periodStart: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  periodEnd: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
})

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const type = req.nextUrl.searchParams.get('type') || CLIENT_REPORT_TYPE
  const reports = await prisma.projectReport.findMany({
    where: { projectId: params.id, type },
    orderBy: { generatedAt: 'desc' },
    take: 20,
  })
  return apiSuccess(reports)
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) {
    const exists = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } })
    return exists ? apiForbidden() : apiNotFound('Project not found')
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return apiValidationError('Invalid report payload', parsed.error.flatten())
  const periodStart = parsed.data.periodStart ? new Date(parsed.data.periodStart) : undefined
  const periodEnd = parsed.data.periodEnd ? new Date(parsed.data.periodEnd) : undefined
  const result = await generateClientReportDraft(params.id, { actorId: session.user.id, periodStart, periodEnd })
  if (result.created) {
    await emit('CLIENT_REPORT_READY', {
      actorId: session.user.id,
      entityType: 'PROJECT',
      entityId: params.id,
      entityTitle: result.projectName,
      explicitRecipients: [result.notifyProjectManagerId],
      data: { reportId: result.report.id, deepLink: `/dashboard/projects/${params.id}` },
    })
  }
  return apiSuccess(result.report, { status: result.created ? 201 : 200 })
})
