'use client'

import { format } from 'date-fns'
import { AlertTriangle, Ban, Check, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useRunDetail } from '../hooks/useAutomations'
import { RunStatusBadge } from './AutomationStatusBadges'

/**
 * The per-step trace for one run — the thing that answers "why was that empty?".
 * Owner and admin only; the API refuses it to recipients.
 */
const STEP_ICON = {
  OK: <Check className="h-3.5 w-3.5 text-success-500" />,
  ERROR: <AlertTriangle className="h-3.5 w-3.5 text-danger-500" />,
  REFUSED: <Ban className="h-3.5 w-3.5 text-warning-500" />,
} as const

export function RunTranscript({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const { data: run, isLoading } = useRunDetail(runId)

  return (
    <Modal open={Boolean(runId)} onClose={onClose} title="Run transcript" size="lg">
      {isLoading && (
        <div className="flex items-center gap-2 py-8 text-body-sm text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading transcript…
        </div>
      )}

      {run && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <RunStatusBadge status={run.status} />
            <span className="text-body-sm text-ink-secondary">
              slot {format(new Date(run.scheduledFor), 'd MMM yyyy HH:mm')} · {run.trigger.toLowerCase()}
              {run.attempt > 1 && ` · attempt ${run.attempt}`}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Plan', `v${run.planVersion}`],
              ['Cost', `$${run.costUsd.toFixed(4)}`],
              ['Tokens in', run.inputTokens.toLocaleString()],
              ['Tokens out', run.outputTokens.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="rounded-card border border-surface-muted p-3">
                <dt className="text-body-sm text-ink-secondary">{label}</dt>
                <dd className="mt-0.5 text-body font-medium text-ink-primary">{value}</dd>
              </div>
            ))}
          </dl>

          {run.errorMessage && (
            <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-3 text-body-sm text-danger-500">
              {run.errorMessage}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-body font-semibold text-ink-primary">
              Steps ({run.steps.length}) · {run.findingCount} finding{run.findingCount === 1 ? '' : 's'}
            </h3>

            {run.steps.length === 0 && (
              <p className="text-body-sm text-ink-secondary">No steps were recorded for this run.</p>
            )}

            <ol className="space-y-2">
              {run.steps.map((step) => (
                <li
                  key={step.stepId}
                  className={cn(
                    'rounded-card border p-3',
                    step.status === 'OK' ? 'border-surface-muted'
                      : step.status === 'REFUSED' ? 'border-warning-500/40 bg-warning-500/5'
                      : 'border-danger-500/30 bg-danger-500/5'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-body-sm font-medium text-ink-primary">
                      {STEP_ICON[step.status]}
                      {step.label}
                      <span className="font-normal text-ink-secondary">({step.tool})</span>
                    </span>
                    <span className="text-body-sm text-ink-secondary">
                      {step.durationMs}ms
                      {step.resultCount !== undefined && ` · ${step.resultCount} rows`}
                    </span>
                  </div>

                  {step.preview && (
                    <p className="mt-2 line-clamp-3 text-body-sm text-ink-secondary">{step.preview}</p>
                  )}
                  {step.error && (
                    <p className="mt-2 text-body-sm text-danger-500">{step.error}</p>
                  )}

                  <details className="mt-2">
                    <summary className="cursor-pointer text-body-sm text-ink-secondary hover:text-primary-600">
                      Resolved arguments
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded-md bg-surface-sidebar p-2 text-xs text-ink-primary">
                      {JSON.stringify(step.args, null, 2)}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  )
}
