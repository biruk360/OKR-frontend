import { NextRequest } from 'next/server'
import { resolveParams, type RouteIdParams } from '@/lib/resolve-route-params'
import { apiSuccess, apiBadRequest, apiForbidden, withAuth } from '@/lib/api'
import { canManageDepartment } from '@/lib/permissions'
import { setDepartmentHead } from '@/lib/orgValidation'

/**
 * PATCH /api/departments/:id/head
 * body { userId: string | null }
 *
 * Sets (or clears) the HEAD of a department. The user must already be an
 * active member; demotes any prior HEAD unless multi-head mode is on.
 */
export const PATCH = withAuth<RouteIdParams>(async (request: NextRequest, { params, session }) => {
  const { id: departmentId } = await resolveParams(params)
  if (!departmentId) return apiBadRequest('Invalid department id')

  if (!(await canManageDepartment(session.user.role as any, session.user.id, departmentId))) {
    return apiForbidden('Insufficient permissions')
  }

  const body = await request.json().catch(() => ({}))
  const { userId } = body ?? {}
  if (userId !== null && typeof userId !== 'string') {
    return apiBadRequest('userId must be a string or null')
  }

  const result = await setDepartmentHead(departmentId, userId)
  if (!result.ok) return apiBadRequest(result.reason)

  return apiSuccess({ ok: true })
})
