import { PageHeader } from '@/components/ui/PageHeader'
import { PerformanceSettingsPanel } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceSettingsPage() {
  await requirePerformancePage('page.settings.performance', 'performance_settings', 'write')
  return (
    <div className="space-y-4">
      <PageHeader
        title="Performance Settings"
        description="Configure calibration thresholds, report attribution, weekly nudges, and reward recommendation rules."
      />
      <PerformanceSettingsPanel />
    </div>
  )
}
