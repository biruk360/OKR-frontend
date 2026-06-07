import { PageHeader } from '@/components/ui'
import { TemplatesWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceTemplatesPage() {
  await requirePerformancePage('page.performance.templates', 'scorecard_template')
  return (
    <div className="space-y-4">
      <PageHeader title="Scorecard Templates" description="Create immutable role scorecards, publish versions, and preserve historical evaluations." />
      <TemplatesWorkspace />
    </div>
  )
}
