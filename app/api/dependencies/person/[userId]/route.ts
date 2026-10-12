import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiBadRequest, apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { resolveParams } from '@/lib/resolve-route-params'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstDependencyIssue, personDependenciesQuerySchema } from '@/features/dependencies/services/schemas'
import { listPersonDependencies } from '@/features/dependencies/services/dependencies.server'
import { dependencyErrorResponse } from '@/features/dependencies/services/http.server'

type Params = { userId: string } | Promise<{ userId: string }>

/**
 * GET /api/dependencies/person/[userId]?timeframeId=&includeClosed= — DEP-1 / PRF-16:
 * `{ inbound, outbound, counts, restricted, permissions }`, each column sorted
 * late → due soon → open → done.
 */
export const GET = withFeature<Params>(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session, params }) => {
  const { userId } = await resolveParams(params)
  if (!userId) return apiBadRequest('Invalid user id')
  const url = new URL(request.url)
  const parsed = personDependenciesQuerySchema.safeParse({
    timeframeId: url.searchParams.get('timeframeId') || undefined,
    includeClosed: url.searchParams.get('includeClosed') || undefined,
  })
  if (!parsed.success) return apiValidationError(firstDependencyIssue(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await listPersonDependencies(viewer, userId, parsed.data))
  } catch (error) {
    return dependencyErrorResponse(error)
  }
})
