'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Ban, Check, FlaskConical, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useBriefing, useRunAutomationNow, useRunDetail } from '../hooks/useAutomations'

/**
 * "Run test run" — trigger a run and watch it to completion in one place.
 *
 * The pieces already existed (trigger, transcript, briefing) but were spread
 * across three screens, so proving an automation works meant triggering it,
 * finding the run, opening the transcript, then opening the briefing. This
 * collapses that into: press once, watch progress, read the output.
 *
 * Polling stops the moment the run reaches a terminal state — a finished run is
 * not re-fetched forever just because the modal is still open.
 */
const IN_FLIGHT = ['QUEUED', 'LEASED', 'RUNNING']

const STEP_ICON = {
  OK: <Check className="h-3.5 w-3.5 text-success-500" />,
  ERROR: <AlertTriangle className="h-3.5 w-3.5 text-danger-500" />,
  REFUSED: <Ban className="h-3.5 w-3.5 text-warning-500" />,
} as const

/** What the user is actually waiting for, in plain language. */
function phaseLabel(status: string | undefined, stepCount: number): string {
  switch (status) {
    case 'QUEUED': return 'Queued — waiting for a worker to pick it up'
    case 'LEASED': return 'Claimed by a worker, starting'
    case 'RUNNING': return stepCount > 0 ? 'Collecting data, then writing the briefing' : 'Running'
    case 'SUCCEEDED': return 'Finished'
    case 'FAILED': return 'Failed'
    case 'SKIPPED': return 'Skipped'
    case 'MISSED': return 'Missed its slot'
    default: return 'Starting'
  }
}

export function TestRunPanel({
  automationId,
  automationName,
  mode,
  disabled,
}: {
  automationId: string
  automationName: string
  mode: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runNow = useRunAutomationNow(automationId)

  // Poll while the run is in flight, then stop. A boolean in state rather than a
  // value derived from `run`, because deriving the polling interval from the data
  // that the polling fetches is circular.
  const [polling, setPolling] = useState(true)
  const { data: run } = useRunDetail(runId, { refetchInterval: polling ? 2000 : false })

  const status = run?.status
  const terminal = Boolean(status && !IN_FLIGHT.includes(status))
  const briefingId = run?.briefing?.id ?? null
  const { data: briefing } = useBriefing(terminal && briefingId ? briefingId : '')

  useEffect(() => {
    if (status && !IN_FLIGHT.includes(status)) setPolling(false)
  }, [status])

  useEffect(() => {
    if (open) return
    setRunId(null)
    setError(null)
    setPolling(true)
  }, [open])

  const start = async () => {
    setError(null)
    setOpen(true)
    try {
      const result = await runNow.mutateAsync()
      setRunId(result.runId)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const steps = run?.steps ?? []

  return (
    <>
      <Button variant="outline" onClick={start} disabled={disabled || runNow.isPending}>
        {runNow.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-1.5 h-4 w-4" />}
        Run test run
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Test run — ${automationName}`} size="lg">
        <div className="space-y-4">
          {mode === 'AUTO' && (
            <div className="rounded-card border border-warning-500/40 bg-warning-500/10 p-3 text-body-sm text-ink-primary">
              This automation is in <strong>Auto</strong>, so a successful test run will email its recipients.
            </div>
          )}

          {error && (
            <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-3 text-body-sm text-danger-500">
              {error}
            </div>
          )}

          {/* --- progress ------------------------------------------------- */}
          <div className="rounded-card border border-surface-muted p-4">
            <div className="flex items-center gap-2">
              {terminal
                ? status === 'SUCCEEDED'
                  ? <Check className="h-4 w-4 text-success-500" />
                  : <X className="h-4 w-4 text-danger-500" />
                : <Loader2 className="h-4 w-4 animate-spin text-primary-600" />}
              <span className="text-body font-medium text-ink-primary">
                {phaseLabel(status, steps.length)}
              </span>
            </div>

            {run && (
              <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Steps', String(steps.length)],
                  ['Findings', String(run.findingCount ?? 0)],
                  ['Cost', `$${(run.costUsd ?? 0).toFixed(4)}`],
                  ['Tokens', `${(run.inputTokens ?? 0) + (run.outputTokens ?? 0)}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-body-sm text-ink-secondary">{label}</dt>
                    <dd className="text-body-sm text-ink-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {run?.errorMessage && (
              <p className="mt-3 rounded-card border border-danger-500/30 bg-danger-500/5 p-2 text-body-sm text-danger-500">
                {run.errorMessage}
              </p>
            )}
          </div>

          {/* --- steps as they arrive ------------------------------------- */}
          {steps.length > 0 && (
            <div>
              <h3 className="mb-2 text-body-sm font-semibold text-ink-secondary">Steps</h3>
              <ul className="space-y-1.5">
                {steps.map((step) => (
                  <li
                    key={step.stepId}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-card border px-3 py-2',
                      step.status === 'OK' ? 'border-surface-muted'
                        : step.status === 'REFUSED' ? 'border-warning-500/40 bg-warning-500/5'
                        : 'border-danger-500/30 bg-danger-500/5'
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-body-sm text-ink-primary">
                      {STEP_ICON[step.status]}
                      <span className="truncate">{step.label}</span>
                      <span className="shrink-0 text-ink-secondary">({step.tool})</span>
                    </span>
                    <span className="shrink-0 text-body-sm text-ink-secondary">
                      {step.resultCount !== undefined ? `${step.resultCount} rows · ` : ''}{step.durationMs}ms
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* --- the output ----------------------------------------------- */}
          {terminal && status === 'SUCCEEDED' && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-body-sm font-semibold text-ink-secondary">Briefing</h3>
                {briefingId && (
                  <Link
                    href={`/dashboard/automations/briefings/${briefingId}`}
                    className="text-body-sm text-primary-600 hover:underline"
                  >
                    Open full briefing →
                  </Link>
                )}
              </div>

              {!briefing && (
                <p className="flex items-center gap-2 text-body-sm text-ink-secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the briefing…
                </p>
              )}

              {briefing && (
                <article
                  className="max-h-[420px] overflow-y-auto rounded-card border border-surface-muted bg-surface-card p-4"
                  // Server-rendered in lib/automations/render.ts, which escapes all
                  // model-supplied text and emits only markup it constructs itself.
                  dangerouslySetInnerHTML={{ __html: briefing.html }}
                />
              )}
            </div>
          )}

          {terminal && status !== 'SUCCEEDED' && !run?.errorMessage && (
            <p className="text-body-sm text-ink-secondary">
              The run ended as {String(status).toLowerCase()} without producing a briefing.
            </p>
          )}
        </div>
      </Modal>
    </>
  )
}
