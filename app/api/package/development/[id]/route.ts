import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstIssueMessage, updateDevelopmentItemSchema } from '@/features/development-plan/services/schemas'
import { getDevelopmentItem, updateDevelopmentItem } from '@/features/development-plan/services/development.server'
import { developmentErrorResponse, readJsonBody } from '@/features/development-plan/services/http.server'

/** GET /api/package/development/[id] — one item (404 when the viewer may not see the owner's plan). */
export const GET = withFeature<RouteIdParams>(PACKAGE_FEATURE_KEYS.module, async (_request, { session, params }) => {
  const { id } = await resolveParams(params)
  try {
    const viewer = await loadPackageViewer(session)
    return apiSuccess(await getDevelopmentItem(viewer, id))
  } catch (error) {
    return developmentErrorResponse(error)
  }
})

/**
 * PATCH /api/package/development/[id] — edit fields and change status.
 * DONE needs an evidence note or link for CERTIFICATION / COURSE (DEV-2);
 * DROPPED needs `dropReason` of at least 10 characters (DEV-5).
 */
export const PATCH = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    const parsed = updateDevelopmentItemSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await updateDevelopmentItem(viewer, id, parsed.data), { message: 'Development item updated' })
    } catch (error) {
      return developmentErrorResponse(error)
    }
  },
)
