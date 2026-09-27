import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { TemplateBuilder } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceTemplateBuilderPage({ params }: { params: { id: string } }) {
  await requirePerformancePage('page.performance.templates', 'scorecard_template')
  return (
    <div className="space-y-4">
      <PageHeader
        title="Template Builder"
        description="Configure tiers, rubric anchors, and metric rules before publication."
        breadcrumb={
          <Link
            href="/dashboard/performance/templates"
            className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:underline"
          >
            <ChevronLeft className="size-3.5" /> Scorecard Templates
          </Link>
        }
      />
      <TemplateBuilder templateId={params.id} />
    </div>
  )
}
