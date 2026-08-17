'use client'

import { useMemo, useState } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils'
import { safeProjectCreationCleanupGroups } from '@/lib/projects/creation-changes'
import type { NormalizedProjectCreationDraft } from '@/lib/projects/creation-normalize'

type CleanupChange = NormalizedProjectCreationDraft['changes'][number]

interface ChangeListPanelProps {
  changes: CleanupChange[]
  onAccept: (changeIds: string[]) => string | null
  onReject: (changeIds: string[]) => string | null
}

function displayValue(value: CleanupChange['originalValue']): string {
  if (value === null) return 'Empty'
  if (typeof value === 'string') return value || 'Empty string'
  return JSON.stringify(value, null, 2)
}

function kindLabel(change: CleanupChange): string {
  return (change.kind ?? 'OTHER').replace(/_/g, ' ').toLowerCase()
}

export function ChangeListPanel({ changes, onAccept, onReject }: ChangeListPanelProps) {
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const safeGroups = useMemo(() => safeProjectCreationCleanupGroups(changes), [changes])
  const proposedCount = changes.filter((change) => change.status === 'PROPOSED').length

  const decide = (changeIds: string[], decision: 'ACCEPT' | 'REJECT') => {
    const error = decision === 'ACCEPT' ? onAccept(changeIds) : onReject(changeIds)
    setDecisionError(error)
  }

  if (changes.length === 0) {
    return <EmptyState bare icon={Sparkles} title="No proposed cleanups" description="No AI or parser cleanup is awaiting a decision." />
  }

  return (
    <section className="space-y-4" aria-labelledby="cleanup-change-list-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 id="cleanup-change-list-title" className="text-body font-semibold text-ink-primary">Proposed changes</h4>
          <p className="mt-1 text-body-sm text-ink-secondary">
            {proposedCount} awaiting a decision. Nothing changes until you accept a proposal; rejection preserves the current value.
          </p>
        </div>
      </div>

      {safeGroups.map((group) => (
        <div key={group.kind} className="flex flex-col gap-3 rounded-card border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-body-sm font-semibold text-ink-primary">Safe group · {group.label}</p>
            <p className="text-body-sm text-ink-secondary">Review {group.changeIds.length} text-only proposals together. No dates, owners, assignees, deliverables, rows, or dependencies are included.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => decide(group.changeIds, 'REJECT')}>
              <X data-icon="inline-start" /> Reject group
            </Button>
            <Button type="button" size="sm" onClick={() => decide(group.changeIds, 'ACCEPT')}>
              <Check data-icon="inline-start" /> Accept group
            </Button>
          </div>
        </div>
      ))}

      {decisionError && (
        <p role="alert" className="rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-body-sm text-danger-700">
          {decisionError}
        </p>
      )}

      <div className="space-y-3">
        {changes.map((change) => (
          <article key={change.id} className={cn(
            'rounded-card border p-4',
            change.status === 'ACCEPTED' && 'border-success-500/30 bg-success-50',
            change.status === 'REJECTED' && 'border-border bg-surface-muted',
            change.status === 'PROPOSED' && 'border-border bg-surface-card',
          )}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-body-sm font-semibold text-ink-primary">{change.path}</p>
                <p className="mt-1 text-overline text-ink-tertiary">{kindLabel(change)} · {change.confidence} confidence</p>
              </div>
              <span className={cn(
                'rounded-pill px-2.5 py-1 text-overline',
                change.status === 'ACCEPTED' ? 'bg-success-500/15 text-success-700' : change.status === 'REJECTED' ? 'bg-surface-hover text-ink-secondary' : 'bg-warning-500/15 text-warning-800',
              )}>{change.status}</span>
            </div>
            <p className="mt-3 text-body-sm text-ink-secondary"><span className="font-semibold text-ink-primary">Reason:</span> {change.reason}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-card bg-surface-muted p-3">
                <p className="text-overline text-ink-tertiary">Original value</p>
                <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-body-sm text-ink-primary">{displayValue(change.originalValue)}</pre>
              </div>
              <div className="rounded-card bg-primary/5 p-3">
                <p className="text-overline text-primary">Proposed value</p>
                <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-body-sm text-ink-primary">{(change.operation ?? 'REPLACE') === 'DELETE' ? 'Delete this duplicate item' : displayValue(change.proposedValue)}</pre>
              </div>
            </div>
            {change.status === 'PROPOSED' ? (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => decide([change.id], 'REJECT')}>
                  <X data-icon="inline-start" /> Reject cleanup
                </Button>
                <Button type="button" size="sm" onClick={() => decide([change.id], 'ACCEPT')}>
                  <Check data-icon="inline-start" /> Accept cleanup
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-body-sm text-ink-secondary">Decision recorded. Use Undo before saving if you need to reconsider it.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
