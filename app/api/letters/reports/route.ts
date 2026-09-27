import { NextRequest } from 'next/server'
import { buildLetterReport, parseReportFilters } from '@/lib/letter-reports'
import { apiBadRequest, apiForbidden, apiSuccess, withAuth } from '@/lib/api'

/**
 * GET /api/letters/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&letterTypeId=…
 * FR-16 aggregates over exactly the letters the caller can read in the list.
 */
export const GET = withAuth(async (request: NextRequest, { session }) => {
  const filters = parseReportFilters(new URL(request.url).searchParams)
  if ('error' in filters) return apiBadRequest(filters.error)
  const report = await buildLetterReport(session.user.id, filters)
  if (!report) return apiForbidden('You are not permitted to view letters')
  return apiSuccess(report)
})
