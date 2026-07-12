import { TemplatesWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceTemplatesPage() {
  await requirePerformancePage('page.performance.templates', 'scorecard_template')
  return (
    <div className="space-y-4">
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <h1 className="text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Scorecard Templates
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
          Create immutable role scorecards, publish versions, and preserve historical evaluations.
        </p>
      </div>
      <TemplatesWorkspace />
    </div>
  )
}
