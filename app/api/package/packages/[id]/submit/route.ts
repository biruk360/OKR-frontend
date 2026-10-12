import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { submitPackage } from '@/features/operating-package/services/packages.server'
import { packageErrorResponse } from '@/features/operating-package/services/http.server'

/**
 * POST /api/package/packages/[id]/submit — DRAFT → IN_REVIEW (PKG-1).
 * Manager chain / HR / Exec / Admin; emits PACKAGE_SENT_FOR_REVIEW to the employee.
 */
export const POST = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (_request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    try {
      const viewer = await loadPackageViewer(session)
      return apiSuccess(await submitPackage(viewer, id), { message: 'Package sent for review' })
    } catch (error) {
      return packageErrorResponse(error)
    }
  },
)
