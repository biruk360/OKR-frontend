import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstIssueMessage, resolveReviewSchema } from '@/features/operating-package/services/schemas'
import { resolvePackageReview } from '@/features/operating-package/services/reviews.server'
import { packageErrorResponse, readJsonBody } from '@/features/operating-package/services/http.server'

type Params = { id: string; reviewId: string } | Promise<{ id: string; reviewId: string }>

/**
 * POST /api/package/packages/[id]/reviews/[reviewId]/resolve  body: { resolution }
 * Manager chain / HR / Exec / Admin close a dispute (never the employee), which
 * unblocks approval once no dispute is open (PKG-1).
 */
export const POST = withFeature<Params>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id, reviewId } = await resolveParams(params)
    const parsed = resolveReviewSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await resolvePackageReview(viewer, id, reviewId, parsed.data), { message: 'Dispute resolved' })
    } catch (error) {
      return packageErrorResponse(error)
    }
  },
)
