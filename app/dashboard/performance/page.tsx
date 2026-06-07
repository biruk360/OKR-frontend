import { PageHeader } from '@/components/ui'
import { PerformanceHome } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function MyPerformancePage() {
  await requirePerformancePage('page.performance.my', 'evaluation')
  return (
    <div className="space-y-4">
      <PageHeader title="My Performance" description="Track review status, finalized results, and development focus areas." />
      <PerformanceHome />
    </div>
  )
}
