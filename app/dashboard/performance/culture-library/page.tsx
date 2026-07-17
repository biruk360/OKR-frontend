import { CultureLibraryManager } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function CultureLibraryPage() {
  await requirePerformancePage('page.performance.culture-library', 'criterion_library_entry')
  return (
    <div className="space-y-4">
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <h1 className="text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Culture Library
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
          Manage reusable culture and values criteria that can be inserted into any draft scorecard template.
        </p>
      </div>
      <CultureLibraryManager />
    </div>
  )
}
