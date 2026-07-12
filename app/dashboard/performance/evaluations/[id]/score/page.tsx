import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ScoringWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function EvaluationScoringPage({ params }: { params: { id: string } }) {
  await requirePerformancePage('page.performance.score', 'evaluation')
  return (
    <div className="space-y-4">
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <Link
          href="/dashboard/performance/evaluations"
          className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
        >
          <ChevronLeft className="size-3.5" /> Evaluation Queue
        </Link>
        <h1 className="text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Performance Evaluation
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
          Scores auto-save when you leave a cell. Submit only after every required criterion is scored.
        </p>
      </div>
      <ScoringWorkspace evaluationId={params.id} />
    </div>
  )
}
