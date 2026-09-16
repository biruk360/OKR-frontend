'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAutomationSettings, useUpdateAutomationSettings } from '../hooks/useAutomations'

interface SettingsFormValues {
  orgDailyCostCapUsd: number
  maxConcurrentRuns: number
  defaultTimezone: string
  retentionDays: number
  domainAllowlist: string
}

/** Admin-only org configuration (FR-18). The kill switch is deliberately separate. */
export function AutomationSettingsForm() {
  const { data: settings, isLoading, error } = useAutomationSettings()
  const update = useUpdateAutomationSettings()
  const [saved, setSaved] = useState(false)

  const { register, handleSubmit, reset } = useForm<SettingsFormValues>()

  useEffect(() => {
    if (!settings) return
    reset({
      orgDailyCostCapUsd: settings.orgDailyCostCapUsd,
      maxConcurrentRuns: settings.maxConcurrentRuns,
      defaultTimezone: settings.defaultTimezone,
      retentionDays: settings.retentionDays,
      domainAllowlist: (settings.domainAllowlist ?? []).join('\n'),
    })
  }, [settings, reset])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="rounded-card border border-danger-500/30 bg-danger-500/5 p-4 text-body-sm text-danger-500">
        {(error as Error)?.message ?? 'Could not load automation settings'}
      </div>
    )
  }

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false)
    await update.mutateAsync({
      orgDailyCostCapUsd: Number(values.orgDailyCostCapUsd),
      maxConcurrentRuns: Number(values.maxConcurrentRuns),
      defaultTimezone: values.defaultTimezone,
      retentionDays: Number(values.retentionDays),
      domainAllowlist: values.domainAllowlist
        .split('\n')
        .map((d) => d.trim())
        .filter(Boolean),
    })
    setSaved(true)
  })

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Automation settings"
        description="Org-wide limits for scheduled AI tasks."
      />

      {/* The kill switch sits outside the form so it never waits on a Save. */}
      <section className="mb-6 rounded-card border border-surface-muted bg-surface-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-body font-semibold text-ink-primary">
              <ShieldAlert className="h-4 w-4 text-warning-500" />
              Global pause
            </h2>
            <p className="mt-1 text-body-sm text-ink-secondary">
              Stops the tick from enqueuing anything and idles every worker. Runs already in flight finish.
            </p>
          </div>
          <Button
            variant={settings.globalPaused ? 'default' : 'outline'}
            onClick={() => update.mutate({ globalPaused: !settings.globalPaused })}
            disabled={update.isPending}
          >
            {settings.globalPaused ? 'Resume all' : 'Pause all'}
          </Button>
        </div>
        {settings.globalPaused && (
          <p className="mt-3 rounded-card border border-warning-500/40 bg-warning-500/10 p-3 text-body-sm text-ink-primary">
            All automations are paused org-wide. Nothing is being scheduled or sent.
          </p>
        )}
      </section>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">Limits</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="orgDailyCostCapUsd">Org daily cost cap (USD)</Label>
              <Input id="orgDailyCostCapUsd" type="number" step="0.01" min={0} {...register('orgDailyCostCapUsd', { valueAsNumber: true })} />
            </div>
            <div>
              <Label htmlFor="maxConcurrentRuns">Max concurrent runs</Label>
              <Input id="maxConcurrentRuns" type="number" min={1} max={20} {...register('maxConcurrentRuns', { valueAsNumber: true })} />
              <p className="mt-1 text-body-sm text-ink-secondary">How many runs a worker executes at once.</p>
            </div>
            <div>
              <Label htmlFor="defaultTimezone">Default timezone</Label>
              <Input id="defaultTimezone" {...register('defaultTimezone')} />
            </div>
            <div>
              <Label htmlFor="retentionDays">Retention (days)</Label>
              <Input id="retentionDays" type="number" min={7} max={3650} {...register('retentionDays', { valueAsNumber: true })} />
            </div>
          </div>
        </section>

        <section className="rounded-card border border-surface-muted bg-surface-card p-5">
          <h2 className="text-body font-semibold text-ink-primary">Domain allowlist</h2>
          <p className="mt-1 text-body-sm text-ink-secondary">
            One domain per line. Applies to the web tools when they land — an empty list means none are reachable.
          </p>
          <Textarea className="mt-3 font-mono text-body-sm" rows={6} placeholder="2merkato.com&#10;ppa.gov.et" {...register('domainAllowlist')} />
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save settings
          </Button>
          {saved && !update.isPending && <span className="text-body-sm text-success-600">Saved</span>}
          {update.isError && (
            <span className="text-body-sm text-danger-500">{(update.error as Error).message}</span>
          )}
        </div>
      </form>
    </div>
  )
}
