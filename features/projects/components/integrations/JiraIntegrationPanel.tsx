'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { AlertTriangle, CheckCircle2, ExternalLink, PlugZap, RotateCw, ShieldCheck } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { JiraAdoptionData, JiraConnectionTestResult, JiraDeveloperMetric } from '../../hooks/useProject'
import { useJiraAdoption, useJiraConnection, useJiraDeveloperMetrics, useSaveJiraConnection, useSyncJiraConnection, useTestJiraConnection } from '../../hooks/useProject'

interface JiraIntegrationPanelProps {
  projectId: string
  canEdit: boolean
}

interface JiraFormValues {
  name: string
  siteUrl: string
  email: string
  apiToken: string
  projectKey: string
}

export function JiraIntegrationPanel({ projectId, canEdit }: JiraIntegrationPanelProps) {
  const connection = useJiraConnection(projectId)
  const testConnection = useTestJiraConnection(projectId)
  const saveConnection = useSaveJiraConnection(projectId)
  const syncConnection = useSyncJiraConnection(projectId)
  const metrics = useJiraDeveloperMetrics(projectId, Boolean(connection.data))
  const adoption = useJiraAdoption(projectId, Boolean(connection.data))
  const [lastTest, setLastTest] = useState<JiraConnectionTestResult | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    getValues,
    formState: { errors },
  } = useForm<JiraFormValues>({
    defaultValues: { name: '', siteUrl: '', email: '', apiToken: '', projectKey: '' },
  })

  useEffect(() => {
    if (!connection.data) return
    reset({
      name: connection.data.name,
      siteUrl: connection.data.siteUrl,
      email: connection.data.email ?? '',
      apiToken: '',
      projectKey: connection.data.projectKey,
    })
  }, [connection.data, reset])

  if (connection.isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  const connected = Boolean(connection.data)

  async function runTest(values: JiraFormValues) {
    setLastTest(null)
    try {
      const result = await testConnection.mutateAsync({
        siteUrl: values.siteUrl,
        email: values.email,
        apiToken: values.apiToken || undefined,
        projectKey: values.projectKey,
      })
      setLastTest(result)
    } catch {
      // Mutation hook owns the toast; keep the form values for correction.
    }
  }

  async function save(values: JiraFormValues) {
    if (!values.apiToken.trim()) {
      setError('apiToken', { message: 'API token is required when saving.' })
      return
    }
    try {
      const result = await saveConnection.mutateAsync({
        name: values.name || undefined,
        siteUrl: values.siteUrl,
        email: values.email,
        apiToken: values.apiToken,
        projectKey: values.projectKey,
      })
      setLastTest(result.test)
      reset({
        name: result.connection.name,
        siteUrl: result.connection.siteUrl,
        email: result.connection.email ?? '',
        apiToken: '',
        projectKey: result.connection.projectKey,
      })
    } catch {
      // Mutation hook owns the toast; keep the form values for correction.
    }
  }

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-section-title text-ink-primary">
            <PlugZap className="size-5" /> Jira Integration
          </div>
          <div className="mt-1 text-body-sm text-ink-secondary">Connect a Jira Cloud project with a write-only API token.</div>
          {connection.data?.lastSyncAt && (
            <div className="mt-1 text-body-xs text-ink-tertiary">
              Last sync {formatDateTime(connection.data.lastSyncAt)} · {connection.data.lastSyncStatus ?? 'UNKNOWN'}
            </div>
          )}
        </div>
        <span className={`rounded-pill px-3 py-1 text-body-sm font-semibold ${connected ? 'bg-success-50 text-success-700' : 'bg-surface-muted text-ink-secondary'}`}>
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {!canEdit && !connected ? (
        <EmptyState icon={ShieldCheck} title="No Jira connection" description="A project manager can connect Jira from this panel." />
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(save)}>
          {connection.data?.lastSyncStatus === 'FAILED' && (
            <div className="rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-body-sm text-danger-700">
              <AlertTriangle className="mr-2 inline size-4" />
              Jira sync failed{connection.data.lastSyncError ? ` — ${connection.data.lastSyncError}` : '.'}
            </div>
          )}
          {connection.data?.lastSyncStatus === 'PARTIAL' && (
            <div className="rounded-card border border-warning-500/30 bg-warning-50 px-4 py-3 text-body-sm text-warning-700">
              <AlertTriangle className="mr-2 inline size-4" />
              Jira sync partially completed{connection.data.lastSyncError ? ` — ${connection.data.lastSyncError}` : '.'}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Connection name" error={errors.name?.message}>
              <input className="input" disabled={!canEdit} placeholder="Meda Jira" {...register('name')} />
            </Field>
            <Field label="Project Key *" error={errors.projectKey?.message}>
              <input
                className="input uppercase"
                disabled={!canEdit}
                placeholder="MEDA"
                {...register('projectKey', { required: 'Project key is required.' })}
              />
            </Field>
            <Field label="Jira Site URL *" error={errors.siteUrl?.message}>
              <input
                className="input"
                disabled={!canEdit}
                placeholder="https://360ground.atlassian.net"
                {...register('siteUrl', { required: 'Jira Site URL is required.' })}
              />
            </Field>
            <Field label="Email *" error={errors.email?.message}>
              <input
                className="input"
                disabled={!canEdit}
                placeholder="pm@360ground.com"
                {...register('email', { required: 'Email is required.' })}
              />
            </Field>
            <Field
              label={connected ? 'API Token * (stored as ••••)' : 'API Token *'}
              error={errors.apiToken?.message}
              hint={connected ? 'Leave blank to test using the saved token. Enter a token to save changes.' : undefined}
            >
              <input className="input" disabled={!canEdit} type="password" placeholder={connected ? '••••' : 'Jira API token'} {...register('apiToken')} />
            </Field>
            <div className="flex items-end justify-between gap-3">
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-body-sm text-primary-600 hover:underline"
              >
                How to get an API token <ExternalLink className="size-3.5" />
              </a>
              {connection.data?.lastSyncStatus && (
                <span className="text-body-sm text-ink-tertiary">Last sync: {connection.data.lastSyncStatus}</span>
              )}
            </div>
          </div>

          {lastTest && (
            <div className="rounded-card border border-success-500/30 bg-success-50 px-4 py-3 text-body-sm text-success-700">
              <CheckCircle2 className="mr-2 inline size-4" />
              Connection successful — found {lastTest.issueCount} issues, {lastTest.sprintCount} sprints as {lastTest.accountName}.
            </div>
          )}

          {connected && <JiraMetricsSummary loading={metrics.isLoading} rows={metrics.data?.rows ?? []} period={metrics.data?.period} />}
          {connected && <JiraAdoptionSummary loading={adoption.isLoading} data={adoption.data} />}

          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              {connected && (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={syncConnection.isPending}
                  onClick={() => syncConnection.mutate()}
                >
                  <RotateCw className="mr-1 size-4" />
                  {syncConnection.isPending ? 'Syncing…' : 'Sync Now'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                disabled={testConnection.isPending}
                onClick={() => void runTest(getValues())}
              >
                {testConnection.isPending ? 'Testing…' : 'Test Connection'}
              </button>
              <button className="btn btn-primary" disabled={saveConnection.isPending} type="submit">
                {saveConnection.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

function JiraAdoptionSummary({ loading, data }: { loading: boolean; data?: JiraAdoptionData }) {
  if (loading) return <Skeleton className="h-24 w-full rounded-card" />
  if (!data?.jiraLinked) return null
  const score = data.project
  return (
    <div className={`rounded-card border px-4 py-3 ${score.warning ? 'border-warning-500/30 bg-warning-50' : 'border-success-500/30 bg-success-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-body-sm font-semibold text-ink-primary">Jira adoption score</div>
          <div className="mt-1 text-body-xs text-ink-secondary">
            Assignee {score.assigneePct}% · Estimate {score.estimatePct}% · Updated 3d {score.updatedRecentlyPct}%{score.storyPointsPct == null ? '' : ` · Points ${score.storyPointsPct}%`}
          </div>
        </div>
        <div className={`text-heading font-semibold ${score.warning ? 'text-warning-700' : 'text-success-700'}`}>{score.score}%</div>
      </div>
      {score.warning && (
        <div className="mt-2 text-body-sm text-warning-700">
          Jira data quality is low ({score.score}%). Metrics may be unreliable.
        </div>
      )}
    </div>
  )
}

function JiraMetricsSummary({ loading, rows, period }: { loading: boolean; rows: JiraDeveloperMetric[]; period?: { from: string; to: string } }) {
  if (loading) return <Skeleton className="h-28 w-full rounded-card" />
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface-hover px-4 py-3 text-body-sm text-ink-secondary">
        No Jira developer metrics yet. Run Sync Now after worklogs and transitions exist.
      </div>
    )
  }
  return (
    <div className="rounded-card border border-border bg-surface-hover p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-body-sm font-semibold text-ink-primary">Developer Jira evidence</div>
        {period && <div className="text-body-xs text-ink-tertiary">{period.from} to {period.to}</div>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-body-sm">
          <thead className="text-body-xs uppercase text-ink-tertiary">
            <tr>
              <th className="py-2 pr-3 font-medium">Developer</th>
              <th className="py-2 pr-3 font-medium">Idle days</th>
              <th className="py-2 pr-3 font-medium">Median accuracy</th>
              <th className="py-2 pr-3 font-medium">Bias</th>
              <th className="py-2 pr-3 font-medium">Issues</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={row.userId ?? row.email ?? row.name} className="border-t border-border">
                <td className="py-2 pr-3 text-ink-primary">{row.name}</td>
                <td className="py-2 pr-3">{row.idleDays}</td>
                <td className="py-2 pr-3">{row.medianEstimateAccuracy == null ? '—' : `${row.medianEstimateAccuracy}x`}</td>
                <td className="py-2 pr-3">{biasLabel(row.estimateBias)}</td>
                <td className="py-2 pr-3">{row.estimatedIssues}/{row.assignedIssues}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function biasLabel(value: JiraDeveloperMetric['estimateBias']) {
  if (value === 'SYSTEMATICALLY_UNDERESTIMATES') return 'Underestimates'
  if (value === 'SYSTEMATICALLY_OVERESTIMATES') return 'Overestimates'
  if (value === 'BALANCED') return 'Balanced'
  return 'Unknown'
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-body-sm font-medium text-ink-secondary">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-1 text-body-xs text-ink-tertiary">{hint}</div>}
      {error && <div className="mt-1 text-body-xs text-danger-600">{error}</div>}
    </label>
  )
}
