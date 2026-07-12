import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { TemplateBuilder } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceTemplateBuilderPage({ params }: { params: { id: string } }) {
  await requirePerformancePage('page.performance.templates', 'scorecard_template')
  return (
    <div className="space-y-4">
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <Link
          href="/dashboard/performance/templates"
          className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
        >
          <ChevronLeft className="size-3.5" /> Scorecard Templates
        </Link>
        <h1 className="text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Template Builder
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
          Configure tiers, rubric anchors, and metric rules before publication.
        </p>
      </div>
      <TemplateBuilder templateId={params.id} />
    </div>
  )
}
