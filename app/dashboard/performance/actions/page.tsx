import { PageHeader } from '@/components/ui'
import { ActionsWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceActionsPage() {
  await requirePerformancePage('page.performance.actions', 'development_action')
  return (
    <div className="space-y-4">
      <PageHeader title="Development Actions" description="Review, approve, reject, and track reward or development recommendations." />
      <ActionsWorkspace />
    </div>
  )
}
