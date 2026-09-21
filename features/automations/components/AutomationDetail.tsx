'use client'

import Link from 'next/link'
import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Clock, FileText, Loader2, Pause, Pencil, Play, ScrollText, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { DistributionMode } from '@/types/automations'
import {
  useAutomation,
  useAutomationRuns,
  useDeleteAutomation,
  useRunAutomationNow,
  useSetMode,
  useSetStatus,
} from '../hooks/useAutomations'
import { RunTranscript } from './RunTranscript'
import { TestRunPanel } from './TestRunPanel'
import { MODE_STYLE, ModeBadge, RunStatusBadge, StatusBadge } from './AutomationStatusBadges'
import { useRouter } from 'next/navigation'

const MODES: DistributionMode[] = ['DRY_RUN', 'REVIEW', 'AUTO']

function duration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function AutomationDetail({ id }: { id: string }) {
  const { data: automation, isLoading } = useAutomation(id)
  // While a run is in flight the timeline polls; otherwise it stays quiet.
  const [polling, setPolling] = useState(false)
  const { data: runs } = useAutomationRuns(id, { refetchInterval: polling ? 3000 : undefined })
  const runNow = useRunAutomationNow(id)
  const setMode = useSetMode(id)
  const setStatus = useSetStatus(id)
  const remove = useDeleteAutomation(id)
  const router = useRouter()

  const [pendingMode, setPendingMode] = useState<DistributionMode | null>(null)
  const [transcriptRunId, setTranscriptRunId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inFlight = (runs ?? []).some((r) => ['QUEUED', 'LEASED', 'RUNNING'].includes(r.status))
  if (inFlight !== polling) setPolling(inFlight)

  if (isLoading || !automation) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    )
  }

  const recipientCount = automation.recipients?.length ?? 0

  const handleModeChange = async (mode: DistributionMode) => {
    setError(null)
    try {
      await setMode.mutateAsync(mode)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPendingMode(null)
    }
  }

  return (
    <div>
      <PageHeader
        title={automation.name}
        description={automation.description ?? undefined}
        breadcrumb={
          <Link href="/dashboard/automations" className="text-body-sm text-ink-secondary hover:text-primary-600">
            ← Automations
          </Link>
        }
        actions={
          <>
            <TestRunPanel
              automationId={automation.id}
              automationName={automation.name}
              mode={automation.mode}
              disabled={inFlight}
            />
            <Link href={`/dashboard/automations/${automation.id}/edit`}>
              <Button variant="outline">
                <Pencil className="mr-1.5 h-4 w-4" />
                Edit
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setStatus.mutate(automation.status === 'ENABLED' ? 'PAUSED' : 'ENABLED')
              }
            >
              {automation.status === 'ENABLED'
                ? <><Pause className="mr-1.5 h-4 w-4" />Pause</>
                : <><Play className="mr-1.5 h-4 w-4" />Resume</>}
            </Button>
            <Button
              onClick={() => runNow.mutate(undefined, { onError: (err) => setError((err as Error).message) })}
              disabled={runNow.isPending || inFlight}
            >
              {runNow.isPending || inFlight
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                : <Zap className="mr-1.5 h-4 w-4" />}
              {inFlight ? 'Running…' : 'Run now'}
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-card border border-danger-500/30 bg-danger-500/5 p-3 text-body-sm text-danger-500">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Distribution mode — the control that decides whether anyone gets email. */}
          <section className="rounded-card border border-surface-muted bg-surface-card p-5">
            <h2 className="text-body font-semibold text-ink-primary">Distribution</h2>
            <p className="mt-1 text-body-sm text-ink-secondary">
              {recipientCount === 0
                ? 'No recipients configured yet.'
                : `${recipientCount} recipient${recipientCount === 1 ? '' : 's'} configured.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => (mode === 'AUTO' ? setPendingMode(mode) : handleModeChange(mode))}
                  disabled={setMode.isPending || automation.mode === mode}
                  className={cn(
                    'rounded-card border px-4 py-3 text-left transition-colors',
                    automation.mode === mode
                      ? 'border-primary-500 bg-primary-500/5'
                      : 'border-surface-muted hover:bg-surface-hover'
                  )}
                >
                  <ModeBadge mode={mode} />
                  <p className="mt-1.5 max-w-[16rem] text-body-sm text-ink-secondary">{MODE_STYLE[mode].hint}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-surface-muted bg-surface-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-body font-semibold text-ink-primary">Runs</h2>
              <span className="text-body-sm text-ink-secondary">{automation.runCount} total</span>
            </div>

            {(!runs || runs.length === 0) && (
              <EmptyState
                bare
                icon={Clock}
                title="No runs yet"
                description="Use Run now to produce the first briefing."
              />
            )}

            <div className="mt-3 space-y-2">
              {(runs ?? []).map((run) => (
                <div key={run.id} className="rounded-card border border-surface-muted p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RunStatusBadge status={run.status} />
                      <span className="text-body-sm text-ink-primary">
                        {format(new Date(run.scheduledFor), 'd MMM yyyy HH:mm')}
                      </span>
                      <span className="text-body-sm text-ink-secondary">{run.trigger.toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-3 text-body-sm text-ink-secondary">
                      <span>{duration(run.durationMs)}</span>
                      <span>${run.costUsd.toFixed(4)}</span>
                      <button
                        type="button"
                        onClick={() => setTranscriptRunId(run.id)}
                        className="flex items-center gap-1 text-primary-600 hover:underline"
                      >
                        <ScrollText className="h-3.5 w-3.5" />
                        Transcript
                      </button>
                    </div>
                  </div>

                  {run.briefing && (
                    <Link
                      href={`/dashboard/automations/briefings/${run.briefing.id}`}
                      className="mt-2 flex items-center gap-1.5 text-body-sm text-primary-600 hover:underline"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {run.briefing.title}
                      <span className="text-ink-secondary">
                        · {run.briefing.newCount} new, {run.briefing.changedCount} changed
                      </span>
                    </Link>
                  )}

                  {run.errorMessage && (
                    <p className="mt-2 flex items-start gap-1.5 text-body-sm text-danger-500">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {run.errorMessage}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-card border border-surface-muted bg-surface-card p-5">
            <h2 className="text-body font-semibold text-ink-primary">Schedule</h2>
            <p className="mt-2 text-body-sm text-ink-primary">{automation.scheduleSummary}</p>
            <dl className="mt-4 space-y-2 text-body-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-secondary">Status</dt>
                <dd><StatusBadge status={automation.status} /></dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-secondary">Next run</dt>
                <dd className="text-ink-primary">
                  {automation.nextRunAt ? formatDistanceToNow(new Date(automation.nextRunAt), { addSuffix: true }) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-secondary">Last run</dt>
                <dd className="text-ink-primary">
                  {automation.lastRunAt ? formatDistanceToNow(new Date(automation.lastRunAt), { addSuffix: true }) : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-secondary">Plan version</dt>
                <dd className="text-ink-primary">v{automation.planVersion}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-secondary">Cost cap / run</dt>
                <dd className="text-ink-primary">${automation.maxCostUsdPerRun.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-secondary">Spend this month</dt>
                <dd
                  className={cn(
                    'text-ink-primary',
                    automation.monthToDateSpendUsd >= automation.maxCostUsdMonth && 'text-danger-500'
                  )}
                >
                  ${automation.monthToDateSpendUsd.toFixed(2)} / ${automation.maxCostUsdMonth.toFixed(2)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-card border border-surface-muted bg-surface-card p-5">
            <h2 className="text-body font-semibold text-ink-primary">Instruction</h2>
            <p className="mt-2 whitespace-pre-wrap text-body-sm text-ink-secondary">{automation.instructionText}</p>
          </section>

          <section className="rounded-card border border-surface-muted bg-surface-card p-5">
            <h2 className="text-body font-semibold text-ink-primary">Tools</h2>
            <ul className="mt-2 space-y-1">
              {automation.toolGrants.map((grant) => (
                <li key={grant.tool} className="text-body-sm text-ink-primary">{grant.tool}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={pendingMode === 'AUTO'}
        onClose={() => setPendingMode(null)}
        onConfirm={() => handleModeChange('AUTO')}
        title="Switch to automatic sending?"
        message={
          recipientCount === 0
            ? 'No recipients are configured, so nothing will be emailed until you add some.'
            : `Every run from now on will email ${recipientCount} recipient${recipientCount === 1 ? '' : 's'} without asking you first.`
        }
        confirmLabel="Switch to auto"
        isLoading={setMode.isPending}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await remove.mutateAsync()
          router.push('/dashboard/automations')
        }}
        title={`Delete "${automation.name}"?`}
        message="The automation stops running immediately. Its briefings are kept for the org's retention period."
        confirmLabel="Delete"
        variant="danger"
        isLoading={remove.isPending}
      />

      <RunTranscript runId={transcriptRunId} onClose={() => setTranscriptRunId(null)} />
    </div>
  )
}
