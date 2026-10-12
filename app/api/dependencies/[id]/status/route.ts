import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiBadRequest, apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { dependencyStatusSchema, firstDependencyIssue } from '@/features/dependencies/services/schemas'
import { changeDependencyStatus } from '@/features/dependencies/services/dependencies.server'
import { dependencyErrorResponse, readDependencyJsonBody } from '@/features/dependencies/services/http.server'

/**
 * POST /api/dependencies/[id]/status — `{ status, note? }`. Providers may set any status
 * except DROPPED; editors may set all. Entering DONE notifies every needer (DEP-5).
 * Data: `{ dependency, changed, notifiedNeeders }`.
 */
export const POST = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    if (!id) return apiBadRequest('Invalid dependency id')
    const parsed = dependencyStatusSchema.safeParse(await readDependencyJsonBody(request))
    if (!parsed.success) return apiValidationError(firstDependencyIssue(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      const result = await changeDependencyStatus(viewer, id, parsed.data, { actorName: session.user.name })
      return apiSuccess(result, { message: result.changed ? 'Status updated' : 'No change' })
    } catch (error) {
      return dependencyErrorResponse(error)
    }
  },
)
