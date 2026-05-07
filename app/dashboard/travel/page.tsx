/**
 * /dashboard/travel — entry surface for the Daily Trip Plan module.
 * Thin composition only (per CLAUDE.md). All data + UI lives in
 * features/daily-trip-plan.
 */

import { TravelHome } from '@/features/daily-trip-plan'
import { PageHeader } from '@/components/ui/PageHeader'

export default function TravelPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Daily Trip Plan" description="Plan, approve, and run the day's field movements." />
      <TravelHome />
    </div>
  )
}
