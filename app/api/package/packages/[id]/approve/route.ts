import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { approvePackage } from '@/features/operating-package/services/packages.server'
import { packageErrorResponse } from '@/features/operating-package/services/http.server'

/**
 * POST /api/package/packages/[id]/approve — DRAFT / IN_REVIEW → APPROVED (PKG-1).
 * Manager chain / Exec / Admin with `button.package.approve`, never self; 409
 * DISPUTES_OPEN while any dispute is unresolved. Emits PACKAGE_APPROVED.
 */
export const POST = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (_request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await approvePackage(viewer, id), { message: 'Operating package approved' })
    } catch (error) {
      return packageErrorResponse(error)
    }
  },
)
