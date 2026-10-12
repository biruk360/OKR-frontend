'use client'

import { useEffect, useMemo, useState, useId } from 'react'
import { useForm } from 'react-hook-form'
import { BarChart3, Gauge, Link2, Lock, Target } from 'lucide-react'
import { Button, Checkbox, EmptyState, Input, Label, MiniBadge } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import { SCRUM_PERFORMANCE_METRICS, SCRUM_PERFORMANCE_METRIC_LABELS } from '@/types/scrum'
import { KPI_DIRECTION_LABELS, KPI_FREQUENCY_LABELS, isKpiDirection, isKpiFrequency } from '@/types/package'
import { useMetricKeyResults, useMetricMappings, useSaveMetricMappings } from '../hooks/queries'
import type { PerformanceTier } from '../types'
import { NativeSelect } from './NativeSelect'
import { SectionCard } from './SectionCard'
import { useMetricKpiOptions, type MetricMappingWithKpi } from './useMetricKpiOptions'

function kpiMeta(kpi: { direction: string; frequency: string; timeframe: { name: string } | null }): string {
  return [
    kpi.timeframe?.name,
    isKpiFrequency(kpi.frequency) ? KPI_FREQUENCY_LABELS[kpi.frequency] : null,
    isKpiDirection(kpi.direction) ? KPI_DIRECTION_LABELS[kpi.direction] : null,
  ].filter(Boolean).join(' · ')
}

type MetricMappingForm = { criterionId: string; employeeId: string; search: string }

export function MetricMappingManager({ templateId, tiers }: { templateId: string; tiers: PerformanceTier[] }) {
  const uid = useId()
  const metrics = useMemo(() => tiers.flatMap((tier) => tier.criteria).filter((criterion) => criterion.type === 'METRIC'), [tiers])
  const mappings = useMetricMappings(templateId)
  const save = useSaveMetricMappings(templateId)
  const { users } = useUsersForSelection()
  const { register, watch } = useForm<MetricMappingForm>({ defaultValues: { criterionId: '', employeeId: '', search: '' } })
  const { criterionId, employeeId, search } = watch()
  const [selected, setSelected] = useState<string[]>([])
  const [selectedScrum, setSelectedScrum] = useState<string[]>([])
  const [selectedKpis, setSelectedKpis] = useState<string[]>([])
  const keyResults = useMetricKeyResults(employeeId)
  const kpiOptions = useMetricKpiOptions(employeeId, criterionId)
  const allMappings = useMemo(() => (mappings.data ?? []) as MetricMappingWithKpi[], [mappings.data])

  useEffect(() => {
    const linked = (mappings.data ?? [])
      .filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId)
      .sort((a, b) => a.position - b.position)
      .map((mapping) => mapping.keyResultId)
      .filter((id): id is string => Boolean(id))
    const linkedScrum = (mappings.data ?? [])
      .filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId)
      .sort((a, b) => a.position - b.position)
      .map((mapping) => mapping.scrumMetricKey)
      .filter((key): key is string => Boolean(key))
    const linkedKpis = allMappings
      .filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId)
      .sort((a, b) => a.position - b.position)
      .map((mapping) => mapping.kpiId)
      .filter((id): id is string => Boolean(id))
    setSelected(linked)
    setSelectedScrum(linkedScrum)
    setSelectedKpis(linkedKpis)
  }, [criterionId, employeeId, mappings.data, allMappings])

  const candidates = (keyResults.data ?? []).filter((keyResult) => keyResult.title.toLowerCase().includes(search.trim().toLowerCase()))
  const currentMappings = (mappings.data ?? []).filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId)
  const kpiCandidates = useMemo(() => {
    const options = kpiOptions.data?.kpis ?? []
    const offered = new Set(options.map((kpi) => kpi.id))
    // Linked KPIs the viewer may not see (KPI-7) stay listed as "Restricted KPI" so a re-save keeps or drops them knowingly.
    const restricted = allMappings
      .filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId && mapping.kpi && !offered.has(mapping.kpi.id))
      .map((mapping) => ({ ...mapping.kpi!, mappable: true, issue: null as string | null }))
    return [...options, ...restricted]
  }, [kpiOptions.data, allMappings, criterionId, employeeId])
  const toggleKpi = (id: string, checked: boolean) => setSelectedKpis((current) => (checked
    ? (current.includes(id) ? current : [...current, id])
    : current.filter((kpiId) => kpiId !== id)))

  if (metrics.length === 0) return null

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Link2 className="size-3.5" /> Employee metric sources</span>}
      contentClassName="space-y-4 px-4 py-4"
    >
      <p className="text-sm text-muted-foreground">
        Link reusable metric criteria to the selected employee&apos;s active Key Results, package KPIs or Daily Scrum metrics. Links are frozen into an evaluation when its cycle opens; a KPI counts as its average reading over the evaluation period.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor={`${uid}-criterion`}>Metric criterion</Label>
          <NativeSelect id={`${uid}-criterion`} {...register('criterionId')}>
            <option value="">Select metric</option>
            {metrics.map((criterion) => <option key={criterion.id} value={criterion.id}>{criterion.title}</option>)}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor={`${uid}-employee`}>Employee</Label>
          <NativeSelect id={`${uid}-employee`} {...register('employeeId')}>
            <option value="">Select employee</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
          </NativeSelect>
        </div>
      </div>
      {criterionId && employeeId && (
        <>
          <div>
            <Label htmlFor={`${uid}-kr-search`}>Search employee Key Results</Label>
            <Input id={`${uid}-kr-search`} {...register('search')} placeholder="Search active Key Results" />
          </div>
          {keyResults.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : candidates.length === 0 ? (
            <EmptyState bare icon={Target} title="No active Key Results" description="This employee needs an active Key Result before an automatic metric can be mapped." />
          ) : (
            <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--ap-border)' }}>
              {candidates.map((keyResult) => (
                <label key={keyResult.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox
                    checked={selected.includes(keyResult.id)}
                    onCheckedChange={(checked) => setSelected((current) => checked === true
                      ? [...current, keyResult.id]
                      : current.filter((id) => id !== keyResult.id))}
                  />
                  <span className="flex-1">{keyResult.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{keyResult.currentValue} / {keyResult.targetValue} {keyResult.unit}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground"><span className="tabular-nums">{currentMappings.length}</span> currently linked · <span className="tabular-nums">{selected.length + selectedScrum.length + selectedKpis.length}</span> selected</p>
            <Button
              disabled={save.isPending}
              onClick={() => {
                const body = { criterionId, employeeId, keyResultIds: selected, scrumMetricKeys: selectedScrum, kpiIds: selectedKpis }
                save.mutate(body)
              }}
            >
              Save metric sources
            </Button>
          </div>
          <div className="space-y-2" role="group" aria-labelledby={`${uid}-kpis`}>
            <Label id={`${uid}-kpis`} className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" aria-hidden /> Package KPIs</Label>
            {kpiOptions.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            ) : kpiOptions.isError ? (
              <p className="text-xs" style={{ color: 'var(--ap-danger-fg)' }}>{kpiOptions.error instanceof Error ? kpiOptions.error.message : 'Could not load KPIs'}</p>
            ) : kpiCandidates.length === 0 ? (
              <EmptyState
                bare
                icon={Gauge}
                title={kpiOptions.data?.permissions.canViewKpis === false ? 'KPIs not visible to you' : 'No active KPIs'}
                description={kpiOptions.data?.permissions.canViewKpis === false
                  ? 'You do not have access to this employee\'s operating package KPIs.'
                  : 'This employee has no active KPI in their operating package.'}
              />
            ) : (
              <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--ap-border)' }}>
                {kpiCandidates.map((kpi) => {
                  const checked = selectedKpis.includes(kpi.id)
                  const redacted = 'redacted' in kpi && kpi.redacted === true
                  // An incompatible KPI can still be unticked, never newly ticked.
                  const disabled = !kpi.mappable && !checked
                  return (
                    <label
                      key={kpi.id}
                      className={cn('flex items-center gap-3 px-3 py-2 text-sm', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(value) => toggleKpi(kpi.id, value === true)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {redacted && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
                          <span className="truncate">{kpi.name}</span>
                          {kpi.isSensitive && !redacted && <MiniBadge tone="warn">Sensitive</MiniBadge>}
                          {kpi.status !== 'ACTIVE' && <MiniBadge>Retired</MiniBadge>}
                        </span>
                        {!redacted && <span className="block text-xs text-muted-foreground">{kpiMeta(kpi)}</span>}
                        {kpi.issue && <span className="block text-xs" style={{ color: 'var(--ap-warn-fg)' }}>{kpi.issue}</span>}
                      </span>
                      {!redacted && kpi.unit && <span className="text-xs text-muted-foreground">{kpi.unit}</span>}
                    </label>
                  )
                })}
              </div>
            )}
            {kpiOptions.data?.permissions.canViewKpis && kpiOptions.data.permissions.hiddenCount > 0 && (
              <p className="text-xs text-muted-foreground">
                <span className="tabular-nums">{kpiOptions.data?.permissions.hiddenCount}</span> sensitive KPI(s) hidden — you do not have access to them.
              </p>
            )}
          </div>
          <div className="space-y-2" role="group" aria-labelledby={`${uid}-scrum-metrics`}>
            <Label id={`${uid}-scrum-metrics`} className="inline-flex items-center gap-1.5"><BarChart3 className="size-3.5" aria-hidden /> Daily Scrum metrics</Label>
            <div className="grid gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--ap-border)' }}>
              {SCRUM_PERFORMANCE_METRICS.map((metricKey) => (
                <label key={metricKey} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={selectedScrum.includes(metricKey)}
                    onCheckedChange={(checked) => setSelectedScrum((current) => checked === true
                      ? [...current, metricKey]
                      : current.filter((key) => key !== metricKey))}
                  />
                  <span>{SCRUM_PERFORMANCE_METRIC_LABELS[metricKey]}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  )
}
