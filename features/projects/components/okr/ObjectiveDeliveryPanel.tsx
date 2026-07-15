'use client'

import Link from 'next/link'
import { Truck, AlertTriangle } from 'lucide-react'
import { useObjectiveDelivery } from '../../hooks/useObjectives'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { RagBadge } from '../ProjectBadges'

interface Props {
  objectiveId: string
}

export function ObjectiveDeliveryPanel({ objectiveId }: Props) {
  const { data: projects, isLoading, isError } = useObjectiveDelivery(objectiveId)

  if (isLoading) {
    return (
      <div className="rounded-card border border-surface-border bg-surface p-4">
        <Skeleton className="mb-3 h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (isError || !projects) {
    return (
      <div className="rounded-card border border-surface-border bg-surface p-4">
        <div className="flex items-center gap-2 text-body-sm text-warning-600">
          <AlertTriangle className="size-4" />
          <span>Could not load delivery projects.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-surface-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-section-title text-ink-primary">
        <Truck className="size-5" />
        <h3>Delivery</h3>
        <span className="ml-auto rounded-pill bg-surface-muted px-2 py-0.5 text-body-sm text-ink-secondary">
          {projects.length}
        </span>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="No linked projects"
          description="Link projects to this objective to see delivery health here."
          bare
          className="py-6"
        />
      ) : (
        <div className="space-y-2">
          {projects.map((p) => {
            const behind = p.percentPlanned - p.percentComplete
            return (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-elevated p-3 transition-colors hover:border-primary-300"
              >
                <div className="min-w-0">
                  <div className="truncate text-body font-medium text-ink-primary">
                    {p.code} · {p.name}
                  </div>
                  <div className="text-body-sm text-ink-secondary">
                    {p.clientName} · {p.projectManagerName ?? 'No PM'}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-body-sm text-ink-secondary">
                  <span className={behind > 5 ? 'text-warning-600' : ''}>
                    {p.percentComplete.toFixed(0)}% / {p.percentPlanned.toFixed(0)}%
                  </span>
                  <span>SPI {p.spi != null ? p.spi.toFixed(2) : '—'}</span>
                  <RagBadge rag={p.ragStatus} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
