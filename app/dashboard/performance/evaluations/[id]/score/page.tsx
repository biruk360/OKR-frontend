import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { ScoringWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function EvaluationScoringPage({ params }: { params: { id: string } }) {
  await requirePerformancePage('page.performance.score', 'evaluation')
  return (
    <div className="space-y-4">
      <PageHeader
        title="Performance Evaluation"
        description="Scores auto-save when you leave a cell. Submit only after every required criterion is scored."
        breadcrumb={
          <Link
            href="/dashboard/performance/evaluations"
            className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:underline"
          >
            <ChevronLeft className="size-3.5" /> Evaluation Queue
          </Link>
        }
      />
      <ScoringWorkspace evaluationId={params.id} />
    </div>
  )
}
