import { PageHeader } from '@/components/ui'
import { CyclesWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceCyclesPage() {
  await requirePerformancePage('page.performance.cycles', 'review_cycle')
  return (
    <div className="space-y-4">
      <PageHeader title="Review Cycles" description="Create review periods and generate evaluations from published role templates." />
      <CyclesWorkspace />
    </div>
  )
}
