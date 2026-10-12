import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import {
  createDependencySchema,
  firstDependencyIssue,
  listDependenciesQuerySchema,
  readListQuery,
} from '@/features/dependencies/services/schemas'
import { createDependency, listDependencies } from '@/features/dependencies/services/dependencies.server'
import { dependencyErrorResponse, readDependencyJsonBody } from '@/features/dependencies/services/http.server'

/**
 * GET /api/dependencies?timeframeId=&status=&type=&providerId=&neederId=&partyId=&due=&linkedType=&linkedId=&deliveryTodoId=&q=&scope=&mine=
 * Company dependency list (DEP-6). Rows the viewer may not open are title + status
 * summaries (`detail: false`). Data: `{ dependencies, total, permissions }`.
 */
export const GET = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = listDependenciesQuerySchema.safeParse(readListQuery(new URL(request.url).searchParams))
  if (!parsed.success) return apiValidationError(firstDependencyIssue(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await listDependencies(viewer, parsed.data))
  } catch (error) {
    return dependencyErrorResponse(error)
  }
})

/**
 * POST /api/dependencies — raise a dependency (any employee). Body: title, depType,
 * neededByDate, providerIds, neederIds, links, … and optional `createDeliveryTask` (DEP-4).
 * Data: `{ dependency, deliveryTask }`.
 */
export const POST = withFeature(PACKAGE_FEATURE_KEYS.module, async (request: NextRequest, { session }) => {
  const parsed = createDependencySchema.safeParse(await readDependencyJsonBody(request))
  if (!parsed.success) return apiValidationError(firstDependencyIssue(parsed.error), parsed.error.issues)
  try {
    const viewer = await loadPackageViewer(session)
    const result = await createDependency(viewer, parsed.data, { actorName: session.user.name })
    return apiSuccess(result, { status: 201, message: 'Dependency created' })
  } catch (error) {
    return dependencyErrorResponse(error)
  }
})
