'use client'

/**
 * One decision, opened from a deep link (`?decision=<id>` from
 * lib/package/links, `?focus=<id>` from lib/connections/flags) or the log.
 * Shows the full record plus the DECISION-type dependencies waiting on it
 * (DEC-2). Actions hand off to the page's shared action dialogs.
 */
import { GitPullRequestArrow, Lock, Scale } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  DecisionRow,
  formatDecisionDate,
  useDecision,
  type DecisionAction,
  type DecisionDTO,
} from '@/features/decisions'
import { DependencyStatusBadge } from '@/features/dependencies'
import { dependencyMapHref } from '@/lib/package/links'

export interface DecisionFocusModalProps {
  decisionId: string | null
  onClose: () => void
  onAction: (action: DecisionAction, decision: DecisionDTO) => void
}

export function DecisionFocusModal({ decisionId, onClose, onAction }: DecisionFocusModalProps) {
  const query = useDecision(decisionId)
  const decision = query.data
  const status = (query.error as { status?: number } | null)?.status

  return (
    <Modal open={!!decisionId} onClose={onClose} title={decision?.externalRef ? `Decision ${decision.externalRef}` : 'Decision'} icon={Scale} size="xl">
      {query.isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading decision">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {query.isError && (
        <EmptyState
          bare
          icon={Lock}
          title={status === 404 ? 'Decision not found' : status === 403 ? 'This decision is private' : 'Could not open this decision'}
          description={
            status === 404
              ? 'It may have been removed, or the link is wrong.'
              : status === 403
                ? 'Decisions are visible to the people they affect, the decider, their managers and leadership.'
                : 'Something went wrong. Try again in a moment.'
          }
          action={status === 403 || status === 404 ? undefined : { label: 'Retry', onClick: () => void query.refetch() }}
        />
      )}

      {decision && (
        <div className="space-y-4">
          <ul className="rounded-card border border-[var(--ap-border)]">
            <DecisionRow
              decision={decision}
              defaultExpanded
              onAction={(action, d) => {
                onClose()
                onAction(action, d)
              }}
            />
          </ul>

          {decision.dependencies.length > 0 && (
            <section aria-label="Dependencies waiting on this decision" className="space-y-2">
              <p className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide text-[var(--ap-fg-subtle)]">
                <GitPullRequestArrow className="size-3.5" aria-hidden />
                Dependencies waiting on this decision
              </p>
              <ul className="divide-y divide-[var(--ap-border)] rounded-card border border-[var(--ap-border)]">
                {decision.dependencies.map((dep) => (
                  <li key={dep.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <a href={dependencyMapHref(dep.id)} className="min-w-0 flex-1 truncate text-body-sm hover:underline ap-focus-ring">
                      {dep.externalRef ? <span className="mr-1.5 font-mono text-caption">{dep.externalRef}</span> : null}
                      {dep.title}
                    </a>
                    {dep.neededByDate && (
                      <span className="text-caption text-[var(--ap-fg-subtle)]">Needed by {formatDecisionDate(dep.neededByDate)}</span>
                    )}
                    <DependencyStatusBadge status={dep.status} hideTiming />
                  </li>
                ))}
              </ul>
              {decision.status !== 'DECIDED' && (
                <p className="text-caption text-[var(--ap-fg-subtle)]">Recording the decision marks these done.</p>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
