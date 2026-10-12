import { withFeature } from '@/lib/api/withAuth'
import { apiBadRequest, apiSuccess } from '@/lib/api/apiResponse'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { createDeliveryTask } from '@/features/dependencies/services/dependencies.server'
import { dependencyErrorResponse } from '@/features/dependencies/services/http.server'

/**
 * POST /api/dependencies/[id]/delivery-task — DEP-4: a Todo (kind = DEPENDENCY) for the
 * first provider, due on the needed-by date. Idempotent (returns the existing task with
 * `created: false`). Completing the Todo does not close the dependency.
 * Data: `{ dependency, todo, created }`.
 */
export const POST = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  if (!id) return apiBadRequest('Invalid dependency id')
  try {
    const viewer = await loadPackageViewer(session)
    const result = await createDeliveryTask(viewer, id, { actorName: session.user.name })
    return apiSuccess(result, {
      status: result.created ? 201 : 200,
      message: result.created ? 'Delivery task created' : 'Delivery task already exists',
    })
  } catch (error) {
    return dependencyErrorResponse(error)
  }
})
