'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * OKR Explorer — Timeline view (was /dashboard/plans' Gantt and /dashboard/timeline).
 * dhtmlx-gantt touches `window`, so it only loads in the browser. Scoping comes
 * from GET /api/gantt (role default + OKR visibility, private rows redacted).
 */
const PlansGantt = dynamic(() => import('@/components/plans/PlansGantt'), {
  ssr: false,
  loading: () => (
    <div className="p-3" aria-busy="true" aria-label="Loading timeline">
      <Skeleton className="h-[480px] w-full rounded-lg" />
    </div>
  ),
})

export default function ExplorerTimelineView() {
  return (
    <div className="rounded-[var(--ap-radius-md)] border bg-card p-3" style={{ borderColor: 'var(--ap-border)' }}>
      <PlansGantt />
    </div>
  )
}
