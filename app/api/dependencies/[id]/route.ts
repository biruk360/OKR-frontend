import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiBadRequest, apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstDependencyIssue, updateDependencySchema } from '@/features/dependencies/services/schemas'
import { getDependency, updateDependency } from '@/features/dependencies/services/dependencies.server'
import { dependencyErrorResponse, readDependencyJsonBody } from '@/features/dependencies/services/http.server'

/** GET /api/dependencies/[id] — the full record when the viewer may open it, else title + status. */
export const GET = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid dependency id')
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await getDependency(viewer, id))
  } catch (error) {
    return dependencyErrorResponse(error)
  }
})

/**
 * PATCH /api/dependencies/[id] — edit fields; `providerIds` / `neederIds` replace that
 * role's parties and `links` replaces the linked items. Creator, a party's managers,
 * Exec / Admin only. Status changes go through POST …/status.
 */
export const PATCH = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    if (!id) return apiBadRequest('Invalid dependency id')
    const parsed = updateDependencySchema.safeParse(await readDependencyJsonBody(request))
    if (!parsed.success) return apiValidationError(firstDependencyIssue(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await updateDependency(viewer, id, parsed.data, { actorName: session.user.name }), {
        message: 'Dependency updated',
      })
    } catch (error) {
      return dependencyErrorResponse(error)
    }
  },
)
