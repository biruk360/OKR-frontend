import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { TemplateBuilder } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceTemplateBuilderPage({ params }: { params: { id: string } }) {
  await requirePerformancePage('page.performance.templates', 'scorecard_template')
  return (
    <div className="space-y-4">
      <PageHeader
        title="Template Builder"
        description="Configure tiers, rubric anchors, and metric rules before publication."
        breadcrumb={<Link href="/dashboard/performance/templates" className="text-sm text-muted-foreground hover:underline">Scorecard Templates</Link>}
      />
      <TemplateBuilder templateId={params.id} />
    </div>
  )
}
