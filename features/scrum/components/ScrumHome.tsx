'use client'

import { AlertCircle, CalendarCheck, Trophy } from 'lucide-react'
import { EmptyState, PageHeader, StatCard, StatGrid } from '@/components/ui'

export function ScrumHome() {
  return (
    <div className="mx-auto max-w-content px-6 py-6">
      <PageHeader
        title="Daily Scrum"
        description="Daily updates, blocker visibility, and team rhythm."
      />

      <StatGrid columns={3}>
        <StatCard label="Submitted today" value="—" icon={CalendarCheck} tone="gray" />
        <StatCard label="Open blockers" value="—" icon={AlertCircle} tone="yellow" />
        <StatCard label="Wins this week" value="—" icon={Trophy} tone="green" />
      </StatGrid>

      <div className="mt-6 rounded-card bg-surface-card p-8 shadow-card">
        <EmptyState
          icon={CalendarCheck}
          title="No scrum updates yet"
          description="Daily updates, blockers, and wins will appear here once the team starts submitting."
          bare
        />
      </div>
    </div>
  )
}
