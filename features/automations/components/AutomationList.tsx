'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Bot, Clock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAutomations } from '../hooks/useAutomations'
import { ModeBadge, StatusBadge } from './AutomationStatusBadges'

function relative(value: string | null): string {
  if (!value) return '—'
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

export function AutomationList() {
  const { data: automations, isLoading, error } = useAutomations('mine')

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Scheduled AI tasks that gather, summarise, and publish a briefing on their own."
        actions={
          <Link href="/dashboard/automations/new">
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              New automation
            </Button>
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}
        </div>
      )}

      {error && (
        <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-4 text-sm text-danger-500">
          {(error as Error).message}
        </div>
      )}

      {automations && automations.length === 0 && (
        <EmptyState
          icon={Bot}
          title="No automations yet"
          description="Create one to check your OKR data on a schedule and publish a briefing to the people who need it."
          action={
            <Link href="/dashboard/automations/new">
              <Button>Create your first automation</Button>
            </Link>
          }
        />
      )}

      {automations && automations.length > 0 && (
        <div className="space-y-3">
          {automations.map((automation) => (
            <Link
              key={automation.id}
              href={`/dashboard/automations/${automation.id}`}
              className="block rounded-card border border-surface-muted bg-surface-card p-4 transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-body font-medium text-ink-primary">{automation.name}</h3>
                    <ModeBadge mode={automation.mode} />
                    <StatusBadge status={automation.status} />
                  </div>
                  {automation.description && (
                    <p className="mt-1 line-clamp-1 text-body-sm text-ink-secondary">{automation.description}</p>
                  )}
                  <p className="mt-2 flex items-center gap-1.5 text-body-sm text-ink-secondary">
                    <Clock className="h-3.5 w-3.5" />
                    {automation.scheduleSummary}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-body-sm text-ink-secondary">Next run</p>
                  <p className="text-body-sm text-ink-primary">{relative(automation.nextRunAt)}</p>
                  <p className="mt-1 text-body-sm text-ink-secondary">Last {relative(automation.lastRunAt)}</p>
                </div>
              </div>

              {automation.consecutiveFailures > 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-body-sm text-danger-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {automation.consecutiveFailures} consecutive failure{automation.consecutiveFailures === 1 ? '' : 's'}
                  {automation.status === 'DISABLED_ON_FAILURE' && ' — disabled until you re-enable it'}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
