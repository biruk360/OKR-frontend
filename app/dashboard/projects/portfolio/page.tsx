import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { LayoutGrid } from 'lucide-react'

export const metadata = { title: 'Portfolio' }

/**
 * Portfolio dashboard (Epic K2) — placeholder until the Intelligence phase (P8).
 * The CEO RAG wall, root-cause Pareto, delay-by-owner, and escalations land here.
 */
export default async function PortfolioPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')

  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <PageHeader title="Portfolio Health" description="Cross-project RAG, delay attribution, and escalations for the CEO." />
      <EmptyState
        icon={LayoutGrid}
        title="Portfolio intelligence is coming soon"
        description="This dashboard (RAG wall, root-cause Pareto, client-vs-360Ground delay split, and escalations) ships in the Intelligence phase of the Project Management module."
      />
    </div>
  )
}
