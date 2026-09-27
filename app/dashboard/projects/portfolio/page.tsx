import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { canReadPortfolio } from '@/lib/projects/portfolio-access'
import { PageHeader } from '@/components/ui/PageHeader'
import { PortfolioDashboard } from '@/features/projects/components/portfolio/PortfolioDashboard'
import { PortfolioReportPanel } from '@/features/projects/components/portfolio/PortfolioReportPanel'
import { PortfolioWbrPanel } from '@/features/projects'

export const metadata = { title: 'Portfolio' }

export default async function PortfolioPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  // Same rule as every /api/projects/portfolio/** route; without it an employee
  // landed on a page whose panels all failed with 403.
  if (!canReadPortfolio(session.user.role)) redirect('/dashboard/projects')

  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <PageHeader title="Portfolio Health" description="Cross-project RAG, delay attribution, and escalations for the CEO." />
      <div className="space-y-6">
        <PortfolioDashboard />
        <PortfolioReportPanel />
        <PortfolioWbrPanel />
      </div>
    </div>
  )
}
