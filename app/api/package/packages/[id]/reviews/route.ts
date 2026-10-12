import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstIssueMessage, upsertReviewSchema } from '@/features/operating-package/services/schemas'
import { listPackageReviews, upsertPackageReview } from '@/features/operating-package/services/reviews.server'
import { packageErrorResponse, readJsonBody } from '@/features/operating-package/services/http.server'

/** GET /api/package/packages/[id]/reviews — every item review, the PKG-2 summary and permissions. */
export const GET = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (_request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await listPackageReviews(viewer, id))
    } catch (error) {
      return packageErrorResponse(error)
    }
  },
)

/**
 * PUT /api/package/packages/[id]/reviews
 * body: { entityType, entityId, verdict: 'AGREE' | 'DISPUTE', comment? } — comment required for DISPUTE.
 * The employee only, while the package is IN_REVIEW (PKG-2). A new dispute emits
 * PACKAGE_ITEM_DISPUTED (digest) to the employee's manager.
 */
export const PUT = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    const parsed = upsertReviewSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await upsertPackageReview(viewer, id, parsed.data), { message: 'Review saved' })
    } catch (error) {
      return packageErrorResponse(error)
    }
  },
)
