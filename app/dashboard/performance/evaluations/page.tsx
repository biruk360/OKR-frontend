import { PageHeader } from '@/components/ui'
import { EvaluatorQueue } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceEvaluationsPage() {
  await requirePerformancePage('page.performance.evaluations', 'evaluation')
  return (
    <div className="space-y-4">
      <PageHeader title="Evaluation Queue" description="Complete scorecards assigned to you while other evaluator scores remain blind." />
      <EvaluatorQueue />
    </div>
  )
}
