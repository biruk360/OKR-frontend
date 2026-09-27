import { PageHeader } from '@/components/ui/PageHeader'
import { CultureLibraryManager } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function CultureLibraryPage() {
  await requirePerformancePage('page.performance.culture-library', 'criterion_library_entry')
  return (
    <div className="space-y-4">
      <PageHeader
        title="Culture Library"
        description="Manage reusable culture and values criteria that can be inserted into any draft scorecard template."
      />
      <CultureLibraryManager />
    </div>
  )
}
