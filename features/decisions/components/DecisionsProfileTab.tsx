'use client'

/**
 * DecisionsProfileTab (PRF-17): the profile's Decisions tab.
 *
 *   - "Awaiting my decision" (DEC-1) when the person is a decider with open
 *     items, grouped by batch, sorted by needed-by, overdue flagged.
 *   - "Decisions affecting <person>" (DEC-3): decisions linked to the person,
 *     to their work (OKRs, tasks, KPIs, duties, development items,
 *     dependencies) or requested by them, with status. The selected
 *     timeframe's decisions plus open ones from any timeframe.
 *
 * Actions follow each decision's `access` flags from the API (DEC-4).
 */
import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MiniBadge } from '@/components/ui'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useDecisionsAffecting } from '../hooks/queries'
import { compareByNeededBy } from '../services/rules'
import type { DecisionDTO } from '../types'
import { AwaitingMyDecisionList } from './AwaitingMyDecisionList'
import { DecisionFormModal } from './DecisionFormModal'
import { DecisionRow, useDecisionActionDialogs } from './DecisionRow'

export interface DecisionsProfileTabProps {
  userId: string
  timeframeId: string
  className?: string
}

type StatusView = 'open' | 'decided' | 'all'

const VIEWS: Array<{ key: StatusView; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'decided', label: 'Decided' },
  { key: 'all', label: 'All' },
]

const cardClass = 'rounded-card border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] shadow-card'

/** Open (OPEN / DEFERRED) first by needed-by, then closed ones, most recently decided first. */
function orderForProfile(items: readonly DecisionDTO[]): DecisionDTO[] {
  const isOpen = (d: DecisionDTO) => d.status === 'OPEN' || d.status === 'DEFERRED'
  const open = items.filter(isOpen).sort(compareByNeededBy)
  const closed = items
    .filter((d) => !isOpen(d))
    .sort((a, b) => (b.decidedAt ?? b.updatedAt).localeCompare(a.decidedAt ?? a.updatedAt))
  return [...open, ...closed]
}

function matchesView(decision: DecisionDTO, view: StatusView): boolean {
  if (view === 'all') return true
  if (view === 'decided') return decision.status === 'DECIDED'
  return decision.status === 'OPEN' || decision.status === 'DEFERRED'
}

export function DecisionsProfileTab({ userId, timeframeId, className }: DecisionsProfileTabProps) {
  const { data: session } = useSession()
  const isSelf = !!session?.user?.id && session.user.id === userId
  const query = useDecisionsAffecting(userId, timeframeId)
  const { run, dialogs } = useDecisionActionDialogs({ defaultDeciderId: query.data?.defaultDeciderId })
  const [view, setView] = useState<StatusView>('open')
  const [requestOpen, setRequestOpen] = useState(false)

  const ordered = useMemo(() => orderForProfile(query.data?.items ?? []), [query.data?.items])
  const counts = useMemo(
    () => ({
      open: ordered.filter((d) => matchesView(d, 'open')).length,
      decided: ordered.filter((d) => matchesView(d, 'decided')).length,
      all: ordered.length,
    }),
    [ordered],
  )
  const shown = ordered.filter((d) => matchesView(d, view))
  const overdue = ordered.filter((d) => d.overdue).length

  const awaiting = (
    <AwaitingMyDecisionList
      deciderId={isSelf ? 'me' : userId}
      title={isSelf ? 'Awaiting my decision' : 'Awaiting their decision'}
      hideWhenEmpty
    />
  )

  if (query.isLoading) {
    return (
      <div className={cn(cardClass, 'space-y-3 p-5', className)} aria-busy="true" aria-label="Loading decisions">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status
    return (
      <EmptyState
        className={className}
        icon={Scale}
        title={status === 403 ? 'Decisions are private' : 'Could not load decisions'}
        description={
          status === 403
            ? 'You do not have access to this person’s decisions.'
            : 'Something went wrong. Try again in a moment.'
        }
        action={status === 403 ? undefined : { label: 'Retry', onClick: () => void query.refetch() }}
      />
    )
  }

  const data = query.data
  const canCreate = !!data?.permissions.canCreate
  const heading = isSelf ? 'Decisions affecting me' : 'Decisions affecting this person'

  const requestModal = (
    <DecisionFormModal
      open={requestOpen}
      onClose={() => setRequestOpen(false)}
      defaults={{ timeframeId, userIds: [userId] }}
      defaultDeciderId={data?.defaultDeciderId}
    />
  )

  return (
    <div className={cn('space-y-4', className)}>
      {awaiting}

      <section className={cardClass} aria-label={heading}>
        <SectionHeading
          title={heading}
          right={
            <div className="flex items-center gap-2">
              {overdue > 0 && <MiniBadge tone="danger">{overdue} overdue</MiniBadge>}
              {canCreate && (
                <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
                  <Plus aria-hidden />
                  Request decision
                </Button>
              )}
            </div>
          }
        />

        {ordered.length === 0 ? (
          <EmptyState
            bare
            icon={Scale}
            title="No decisions affect this person"
            description="Decisions needed from the CEO (or another decider) show here when they are linked to this person, to their OKRs, tasks, KPIs, duties, development items or dependencies, or when they asked for them."
            action={canCreate ? { label: 'Request a decision', onClick: () => setRequestOpen(true) } : undefined}
          />
        ) : (
          <>
            <div className="flex gap-1 overflow-x-auto px-4 pt-3" role="tablist" aria-label="Filter decisions by status">
              {VIEWS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="tab"
                  aria-selected={view === option.key}
                  onClick={() => setView(option.key)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-caption font-medium ap-focus-ring transition-colors',
                    view === option.key
                      ? 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]'
                      : 'text-[var(--ap-fg-subtle)] hover:bg-surface-hover',
                  )}
                >
                  {option.label} <span className="tabular-nums">{counts[option.key]}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="px-4 py-6 text-center text-body-sm text-[var(--ap-fg-subtle)]">
                {view === 'open' ? 'No open decisions affect this person.' : 'No decided decisions yet.'}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--ap-border)]">
                {shown.map((decision) => (
                  <DecisionRow key={decision.id} decision={decision} onAction={run} showRelations />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {requestModal}
      {dialogs}
    </div>
  )
}
