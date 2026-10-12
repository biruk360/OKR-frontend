import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { createDutySchema, firstDutyIssue, listDutiesQuerySchema } from '@/features/duties/services/schemas'
import { createDuty, listDuties } from '@/features/duties/services/duties.server'
import { dutyErrorResponse, readDutyJsonBody } from '@/features/duties/services/http.server'

/**
 * GET /api/package/duties?userId=&timeframeId=&includeRetired=
 * A person's recurring duties (default: the caller), with next due, overdue,
 * 30/90-day adherence (DUT-5) and the viewer's `permissions`.
 * Data: `{ duties, permissions }`.
 */
export const GET = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const url = new URL(request.url)
  const parsed = listDutiesQuerySchema.safeParse({
    userId: url.searchParams.get('userId') || undefined,
    timeframeId: url.searchParams.get('timeframeId') || undefined,
    includeRetired: url.searchParams.get('includeRetired') || undefined,
  })
  if (!parsed.success) return apiValidationError(firstDutyIssue(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await listDuties(viewer, parsed.data))
  } catch (error) {
    return dutyErrorResponse(error)
  }
})

/**
 * POST /api/package/duties — create a duty (DUT-1…3, DUT-8). With `autoTask`
 * and a calendar cadence it also creates the Todo recurrence head.
 */
export const POST = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = createDutySchema.safeParse(await readDutyJsonBody(request))
  if (!parsed.success) return apiValidationError(firstDutyIssue(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const duty = await createDuty(viewer, parsed.data, { actorName: session.user.name })
    return apiSuccess(duty, { status: 201, message: 'Duty created' })
  } catch (error) {
    return dutyErrorResponse(error)
  }
})
