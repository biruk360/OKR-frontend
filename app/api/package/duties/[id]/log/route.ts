import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiBadRequest, apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstDutyIssue, logDutyOccurrenceSchema } from '@/features/duties/services/schemas'
import { logDutyOccurrence } from '@/features/duties/services/duties.server'
import { dutyErrorResponse, readDutyJsonBody } from '@/features/duties/services/http.server'

/**
 * POST /api/package/duties/[id]/log — DUT-3 "Log occurrence": a one-off duty
 * card (kind DUTY, linked to the duty), due today unless `dueDate` is given.
 * Body: `{ dueDate?, completed?, note? }`. Data: `{ todoId, duty }`.
 */
export const POST = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    if (!id) return apiBadRequest('Invalid duty id')
    const parsed = logDutyOccurrenceSchema.safeParse((await readDutyJsonBody(request)) ?? {})
    if (!parsed.success) return apiValidationError(firstDutyIssue(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      const result = await logDutyOccurrence(viewer, id, parsed.data)
      return apiSuccess(result, { status: 201, message: 'Occurrence logged' })
    } catch (error) {
      return dutyErrorResponse(error)
    }
  },
)
