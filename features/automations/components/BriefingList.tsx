'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { FileText } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useBriefings } from '../hooks/useAutomations'

/**
 * Every briefing the caller owns or has been sent. Without this page a recipient
 * can only reach a briefing through the emailed link.
 */
export function BriefingList({ automationId }: { automationId?: string } = {}) {
  const { data: briefings, isLoading, error } = useBriefings(automationId)

  return (
    <div>
      <PageHeader
        title="Briefings"
        description="Documents produced by your automations, and those sent to you."
        breadcrumb={
          <Link href="/dashboard/automations" className="text-body-sm text-ink-secondary hover:text-primary-600">
            ← Automations
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}
        </div>
      )}

      {error && (
        <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-4 text-body-sm text-danger-500">
          {(error as Error).message}
        </div>
      )}

      {briefings && briefings.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No briefings yet"
          description="Briefings appear here once an automation has run."
        />
      )}

      {briefings && briefings.length > 0 && (
        <div className="space-y-3">
          {briefings.map((briefing) => (
            <Link
              key={briefing.id}
              href={`/dashboard/automations/briefings/${briefing.id}`}
              className="block rounded-card border border-surface-muted bg-surface-card p-4 transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="truncate text-body font-medium text-ink-primary">{briefing.title}</h3>
                  <p className="mt-1 line-clamp-2 text-body-sm text-ink-secondary">{briefing.summary}</p>
                  <p className="mt-2 text-body-sm text-ink-secondary">
                    {briefing.automationName} · {format(new Date(briefing.createdAt), 'd MMM yyyy HH:mm')}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {briefing.newCount > 0 && (
                    <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-600">
                      {briefing.newCount} new
                    </span>
                  )}
                  {briefing.changedCount > 0 && (
                    <span className="rounded-full bg-warning-500/15 px-2 py-0.5 text-xs font-medium text-warning-600">
                      {briefing.changedCount} changed
                    </span>
                  )}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      briefing.status === 'PUBLISHED' ? 'bg-success-500/10 text-success-600'
                        : briefing.status === 'PENDING_REVIEW' ? 'bg-warning-500/15 text-warning-600'
                        : 'bg-surface-muted text-ink-secondary'
                    )}
                  >
                    {briefing.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
