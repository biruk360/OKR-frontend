import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiBadRequest, apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstDutyIssue, updateDutySchema } from '@/features/duties/services/schemas'
import { deleteDuty, getDuty, updateDuty } from '@/features/duties/services/duties.server'
import { dutyErrorResponse, readDutyJsonBody } from '@/features/duties/services/http.server'

/** GET /api/package/duties/[id] — one duty (same shape as a list row). */
export const GET = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid duty id')
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await getDuty(viewer, id))
  } catch (error) {
    return dutyErrorResponse(error)
  }
})

/**
 * PATCH /api/package/duties/[id] — edit fields (DUT-4: cadence / timing / end
 * date changes update the head in the same transaction), or run one action:
 * `{ action: 'pause' | 'resume' | 'retire' }`.
 */
export const PATCH = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    if (!id) return apiBadRequest('Invalid duty id')
    const parsed = updateDutySchema.safeParse(await readDutyJsonBody(request))
    if (!parsed.success) return apiValidationError(firstDutyIssue(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await updateDuty(viewer, id, parsed.data), { message: 'Duty updated' })
    } catch (error) {
      return dutyErrorResponse(error)
    }
  },
)

/** DELETE /api/package/duties/[id] — only when no occurrence was completed (DUT-6); otherwise 409, retire instead. */
export const DELETE = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid duty id')
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await deleteDuty(viewer, id), { message: 'Duty deleted' })
  } catch (error) {
    return dutyErrorResponse(error)
  }
})
