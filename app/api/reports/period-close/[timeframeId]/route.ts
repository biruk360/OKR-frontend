import { apiForbidden, apiNotFound, apiSuccess, withAuth } from '@/lib/api'
import { buildPeriodCloseReport } from '@/lib/okr/period-report'

export const GET = withAuth<{ timeframeId: string }>(async (_request, { session, params }) => {
  const report = await buildPeriodCloseReport(params.timeframeId, { id: session.user.id, role: session.user.role })
  if (report === null) return apiForbidden('Period-close reports are available to department leads, executives, and administrators')
  if (report === undefined) return apiNotFound('Timeframe not found')
  return apiSuccess(report)
})
