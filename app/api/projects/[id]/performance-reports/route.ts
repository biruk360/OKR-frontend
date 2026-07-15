import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getReadableProject, getWritableProject } from '@/lib/projects/access'
import { apiForbidden, apiNotFound, apiSuccess, apiValidationError, withAuth } from '@/lib/api'
import {
  generatePerformanceReports,
  listPerformanceReports,
  PERFORMANCE_CADENCES,
  type PerformanceCadence,
} from '@/lib/projects/performance-reports'

const schema = z.object({
  cadence: z.enum(PERFORMANCE_CADENCES).default('WEEKLY'),
})

export const GET = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getReadableProject(session, params.id)
  if (!access) return apiForbidden()
  const cadence = req.nextUrl.searchParams.get('cadence') as PerformanceCadence | null
  return apiSuccess(await listPerformanceReports(params.id, cadence && PERFORMANCE_CADENCES.includes(cadence) ? cadence : undefined))
})

export const POST = withAuth<{ id: string }>(async (req: NextRequest, { session, params }) => {
  const access = await getWritableProject(session, params.id)
  if (!access) return apiForbidden()
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return apiValidationError('Invalid performance report payload', parsed.error.flatten())
  const result = await generatePerformanceReports(params.id, parsed.data.cadence, session.user.id)
  if (result.hidden) {
    const exists = await getReadableProject(session, params.id)
    return exists ? apiSuccess(result) : apiNotFound('Project not found')
  }
  return apiSuccess(result, { status: result.individualReport && result.teamReport ? 201 : 200 })
})
