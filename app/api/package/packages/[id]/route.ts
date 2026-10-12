import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { firstIssueMessage, updatePackageSchema } from '@/features/operating-package/services/schemas'
import { getPackageById, updatePackage } from '@/features/operating-package/services/packages.server'
import { packageErrorResponse, readJsonBody } from '@/features/operating-package/services/http.server'

/** GET /api/package/packages/[id] — same payload as the list route. */
export const GET = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (_request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await getPackageById(viewer, id))
    } catch (error) {
      return packageErrorResponse(error)
    }
  },
)

/**
 * PATCH /api/package/packages/[id]
 * body: any of { version, seatTitle, summaryLines, weights, sourceFile, status: 'DRAFT' | 'ARCHIVED' }.
 * Header fields: §8 `package` edit; weights: §8 `weights` edit; status moves: package lifecycle.
 * Reopening an APPROVED package bumps the version and clears the approval.
 * Edits to an APPROVED package are logged with metadata.editedAfterApproval (PKG-3).
 */
export const PATCH = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    const parsed = updatePackageSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await updatePackage(viewer, id, parsed.data), { message: 'Operating package updated' })
    } catch (error) {
      return packageErrorResponse(error)
    }
  },
)
