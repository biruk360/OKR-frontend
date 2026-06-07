import { PageHeader } from '@/components/ui'
import { ScoringWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function EvaluationScoringPage({ params }: { params: { id: string } }) {
  await requirePerformancePage('page.performance.score', 'evaluation')
  return (
    <div className="space-y-4">
      <PageHeader title="Performance Evaluation" description="Scores auto-save when you leave a cell. Submit only after every required criterion is scored." />
      <ScoringWorkspace evaluationId={params.id} />
    </div>
  )
}
