'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { BarChart3, Link2, Target } from 'lucide-react'
import { Button, Checkbox, EmptyState, Input, Label } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { SCRUM_PERFORMANCE_METRICS, SCRUM_PERFORMANCE_METRIC_LABELS } from '@/types/scrum'
import { useMetricKeyResults, useMetricMappings, useSaveMetricMappings } from '../hooks/queries'
import type { PerformanceTier } from '../types'
import { NativeSelect } from './NativeSelect'
import { SectionCard } from './SectionCard'

type MetricMappingForm = { criterionId: string; employeeId: string; search: string }

export function MetricMappingManager({ templateId, tiers }: { templateId: string; tiers: PerformanceTier[] }) {
  const metrics = useMemo(() => tiers.flatMap((tier) => tier.criteria).filter((criterion) => criterion.type === 'METRIC'), [tiers])
  const mappings = useMetricMappings(templateId)
  const save = useSaveMetricMappings(templateId)
  const { users } = useUsersForSelection()
  const { register, watch } = useForm<MetricMappingForm>({ defaultValues: { criterionId: '', employeeId: '', search: '' } })
  const { criterionId, employeeId, search } = watch()
  const [selected, setSelected] = useState<string[]>([])
  const [selectedScrum, setSelectedScrum] = useState<string[]>([])
  const keyResults = useMetricKeyResults(employeeId)

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
    setSelected(linked)
    setSelectedScrum(linkedScrum)
  }, [criterionId, employeeId, mappings.data])

  const candidates = (keyResults.data ?? []).filter((keyResult) => keyResult.title.toLowerCase().includes(search.trim().toLowerCase()))
  const currentMappings = (mappings.data ?? []).filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId)

  if (metrics.length === 0) return null

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-1.5"><Link2 className="size-3.5" /> Employee metric sources</span>}
      contentClassName="space-y-4 px-4 py-4"
    >
      <p className="text-sm text-muted-foreground">
        Link reusable metric criteria to the selected employee&apos;s active Key Results. Links are frozen into an evaluation when its cycle opens.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Metric criterion</Label>
          <NativeSelect {...register('criterionId')}>
            <option value="">Select metric</option>
            {metrics.map((criterion) => <option key={criterion.id} value={criterion.id}>{criterion.title}</option>)}
          </NativeSelect>
        </div>
        <div>
          <Label>Employee</Label>
          <NativeSelect {...register('employeeId')}>
            <option value="">Select employee</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
          </NativeSelect>
        </div>
      </div>
      {criterionId && employeeId && (
        <>
          <div>
            <Label>Search employee Key Results</Label>
            <Input {...register('search')} placeholder="Search active Key Results" />
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
            <p className="text-xs text-muted-foreground"><span className="tabular-nums">{currentMappings.length}</span> currently linked · <span className="tabular-nums">{selected.length + selectedScrum.length}</span> selected</p>
            <Button disabled={save.isPending} onClick={() => save.mutate({ criterionId, employeeId, keyResultIds: selected, scrumMetricKeys: selectedScrum })}>
              Save metric sources
            </Button>
          </div>
          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5"><BarChart3 className="size-3.5" /> Daily Scrum metrics</Label>
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
