import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { apiBadRequest, apiForbidden, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import {
  generateManagementReports,
  listManagementReports,
  MANAGEMENT_REPORT_CADENCES,
  type ManagementReportCadence,
} from '@/lib/projects/management-reports'

const schema = z.object({
  cadence: z.enum(MANAGEMENT_REPORT_CADENCES).default('MONTHLY'),
})

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const cadence = req.nextUrl.searchParams.get('cadence') as ManagementReportCadence | null
  return apiSuccess(await listManagementReports(params.id, cadence && MANAGEMENT_REPORT_CADENCES.includes(cadence) ? cadence : undefined))
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return apiValidationError('Invalid management report payload', parsed.error.flatten())
  try {
    const result = await generateManagementReports(params.id, parsed.data.cadence, session.user.id)
    return apiSuccess(result, { status: result.reports.length ? 201 : 200 })
  } catch (err) {
    return apiBadRequest(err instanceof Error ? err.message : String(err))
  }
})
