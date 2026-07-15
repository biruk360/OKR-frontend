import { NextRequest } from 'next/server'
import { buildPortfolioDashboard, type PortfolioDashboardFilters } from '@/lib/projects/portfolio-dashboard'
import { apiForbidden, apiSuccess, withAuth } from '@/lib/api'

function canReadPortfolio(role: string): boolean {
  return role === 'ADMIN' || role === 'EXECUTIVE' || role === 'DEPARTMENT_LEAD'
}

export const GET = withAuth(async (req: NextRequest, { session }) => {
  if (!canReadPortfolio(session.user.role)) {
    return apiForbidden('Portfolio dashboard is restricted to executives and department leads')
  }

  const { searchParams } = new URL(req.url)
  const filters: PortfolioDashboardFilters = {
    client: searchParams.get('client') ?? undefined,
    projectManagerId: searchParams.get('projectManagerId') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  }

  const data = await buildPortfolioDashboard(filters)
  return apiSuccess(data)
})
