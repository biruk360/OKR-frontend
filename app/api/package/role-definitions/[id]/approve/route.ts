import type { NextRequest } from 'next/server'
import { withFeature } from '@/lib/api/withAuth'
import { apiSuccess, apiValidationError } from '@/lib/api/apiResponse'
import { loadPackageViewer } from '@/lib/package/access'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import { approveRoleDefinitionSchema, firstIssueMessage } from '@/features/role-definition/services/schemas'
import { approveRoleDefinition } from '@/features/role-definition/services/role-definitions.server'
import { readJsonBody, roleDefinitionErrorResponse } from '@/features/role-definition/services/http.server'

/**
 * POST /api/package/role-definitions/[id]/approve  body: { updateDesignation?: boolean }
 * ROL-1: approves the DRAFT and supersedes the previous APPROVED version in the
 * same timeframe. ROL-2: `updateDesignation` also sets User.designation to the
 * seat title. Manager chain / Exec / Admin with `button.package.role.approve`; never self.
 */
export const POST = withFeature<RouteIdParams>(
  PACKAGE_FEATURE_KEYS.module,
  async (request: NextRequest, { session, params }) => {
    const { id } = await resolveParams(params)
    const body = await readJsonBody(request)
    const parsed = approveRoleDefinitionSchema.safeParse(body ?? {})
    if (!parsed.success) return apiValidationError(firstIssueMessage(parsed.error), parsed.error.issues)
    try {
      const viewer = await loadPackageViewer(session)
      const result = await approveRoleDefinition(viewer, id, parsed.data)
      return apiSuccess(result, { message: 'Role definition approved' })
    } catch (error) {
      return roleDefinitionErrorResponse(error)
    }
  },
)
