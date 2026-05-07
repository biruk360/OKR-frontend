/**
 * GET /api/dtp/sheet/:deptId/:date — Daily Movement Sheet for (department, date).
 * `:deptId` may be the literal string "all" to bypass the department filter.
 */

import { apiSuccess, apiBadRequest, apiForbidden } from '@/lib/api'
import { withAuth } from '@/lib/api/withAuth'
import { buildMovementSheet } from '@/lib/dtp/sheets'
import { canActAsCoordinator, canReadAllDtp } from '@/lib/dtp/permissions'
import { parsePathDate } from '@/lib/dtp/api-helpers'

export const GET = withAuth<{ deptId: string; date: string }>(async (_req, { session, params }) => {
  const date = parsePathDate(params.date)
  if (!date) return apiBadRequest('Invalid date — expected YYYY-MM-DD')
  const departmentId = params.deptId === 'all' ? null : params.deptId
  const allowed = (await canReadAllDtp(session)) || (await canActAsCoordinator(session, departmentId))
  if (!allowed) return apiForbidden('You do not have access to this department\'s movement sheet')
  const sheet = await buildMovementSheet(departmentId, date)
  return apiSuccess(sheet)
})
