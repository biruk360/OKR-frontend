'use client'

/**
 * AwaitingMyDecisionList (DEC-1): the decider's open decisions, grouped by
 * batch and sorted by needed-by date, with overdue items flagged. Used on the
 * decider's profile (Decisions tab) and the Decisions page.
 */
import { CheckCircle2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { MiniBadge } from '@/components/ui'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useAwaitingDecisions } from '../hooks/queries'
import { groupDecisionsByBatch } from '../services/rules'
import { DecisionRow, useDecisionActionDialogs } from './DecisionRow'

export interface AwaitingMyDecisionListProps {
  /** Whose queue: a user id, or 'me' (default) for the viewer. */
  deciderId?: string
  title?: string
  /** Render nothing (not even the empty state) when the queue is empty. */
  hideWhenEmpty?: boolean
  className?: string
}

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-card'

export function AwaitingMyDecisionList({
  deciderId = 'me',
  title = 'Awaiting my decision',
  hideWhenEmpty = false,
  className,
}: AwaitingMyDecisionListProps) {
  const query = useAwaitingDecisions(deciderId)
  const { run, dialogs } = useDecisionActionDialogs({ defaultDeciderId: query.data?.defaultDeciderId })

  if (query.isLoading) {
    return (
      <section className={cn(cardClass, 'space-y-3 p-4', className)} aria-busy="true" aria-label="Loading decisions">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </section>
    )
  }

  if (query.isError) {
    if (hideWhenEmpty) return null
    return (
      <EmptyState
        className={className}
        title="Could not load the decision queue"
        description="Something went wrong. Try again in a moment."
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
      />
    )
  }

  const items = query.data?.items ?? []
  if (items.length === 0) {
    if (hideWhenEmpty) return null
    return (
      <section className={cn(cardClass, className)} aria-label={title}>
        <SectionHeading title={title} />
        <EmptyState
          bare
          icon={CheckCircle2}
          title="Nothing is waiting"
          description="Open decisions where you are the decider appear here, grouped by batch."
        />
      </section>
    )
  }

  const groups = groupDecisionsByBatch(items)
  const overdue = items.filter((d) => d.overdue).length

  return (
    <section className={cn(cardClass, className)} aria-label={title}>
      <SectionHeading
        title={title}
        right={
          <div className="flex items-center gap-1.5">
            {overdue > 0 && <MiniBadge tone="danger">{overdue} overdue</MiniBadge>}
            <MiniBadge tone="accent">{items.length} open</MiniBadge>
          </div>
        }
      />
      <div className="divide-y divide-[var(--ap-border)]">
        {groups.map((group) => (
          <div key={group.batch ?? '__none__'}>
            <div className="flex items-center justify-between gap-2 bg-[var(--ap-bg-sunken)] px-4 py-1.5">
              <p className="text-caption font-semibold text-[var(--ap-fg)]">{group.batch ? `Batch ${group.batch}` : 'No batch'}</p>
              <span className="text-caption text-[var(--ap-fg-subtle)]">
                {group.items.length} item{group.items.length === 1 ? '' : 's'}
                {group.overdueCount > 0 ? ` · ${group.overdueCount} overdue` : ''}
              </span>
            </div>
            <ul className="divide-y divide-[var(--ap-border)]">
              {group.items.map((decision) => (
                <DecisionRow key={decision.id} decision={decision} onAction={run} showDecider={deciderId !== 'me'} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {dialogs}
    </section>
  )
}
