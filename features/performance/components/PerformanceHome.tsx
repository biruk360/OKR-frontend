'use client'

import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { BarChart3, LockKeyhole } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, Button, EmptyState, Input } from '@/components/ui'
import { KpiCard } from '@/components/ui/dashboard'
import { Skeleton } from '@/components/ui/Skeleton'
import { useMyPerformance, useUpdateWeeklyStep } from '../hooks/queries'
import type { MyPerformanceChartData } from '../types'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { SectionCard } from './SectionCard'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'
import { CompetencyRadar, radarItemsFromTierBreakdown } from './CompetencyRadar'
import { PerformanceTrend } from './PerformanceTrend'

function WeeklyStepForm({ focusId, defaultValue, isPending, onSave }: {
  focusId: string
  defaultValue: string
  isPending: boolean
  onSave: (weeklyStep: string) => void
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<{ weeklyStep: string }>({
    defaultValues: { weeklyStep: defaultValue },
  })
  const submit = handleSubmit((values) => onSave(values.weeklyStep.trim()))
  return (
    <form className="mt-3" onSubmit={submit} data-focus-id={focusId}>
      <div className="flex gap-2">
        <Input
          {...register('weeklyStep', { validate: (value) => value.trim().length > 0 || 'Enter a weekly step before saving' })}
          placeholder="Commit a weekly step"
          className="flex-1"
        />
        <Button type="submit" disabled={isPending}>Save</Button>
      </div>
      {errors.weeklyStep && <p className="mt-1 text-xs text-danger-600">{errors.weeklyStep.message}</p>}
    </form>
  )
}

export function PerformanceHome() {
  const query = useMyPerformance()
  const updateStep = useUpdateWeeklyStep()
  const permissions = usePerformancePermissions()
  const canUpdateFocus = permissions.can('page.performance.my', 'improvement_focus', 'canWrite')
  const rows = query.data?.evaluations ?? []
  const finalized = rows.filter((evaluation) => evaluation.status === 'FINALIZED')
  const active = rows.filter((evaluation) => !['FINALIZED', 'EXCUSED'].includes(evaluation.status))
  // Extra fields exposed by /api/performance/me beyond the base client type.
  const chartData = query.data as unknown as MyPerformanceChartData | undefined
  const latestReport = chartData?.latestReport ?? null
  const radarItems = radarItemsFromTierBreakdown(latestReport?.contentJson.tierBreakdown)
  const trendPoints = (chartData?.evaluations ?? [])
    .filter((evaluation) => evaluation.status === 'FINALIZED' && evaluation.normalized != null)
    .map((evaluation) => ({
      cycleName: evaluation.cycle.name,
      periodEnd: evaluation.cycle.periodEnd ?? '',
      normalized: evaluation.normalized ?? null,
    }))
  const hasSealedInProgress = (chartData?.evaluations ?? []).some((evaluation) =>
    evaluation.sealed && ['OPEN', 'CONSOLIDATING'].includes(evaluation.cycle.status ?? ''))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Active reviews" value={active.length} tint="var(--ap-accent)" />
        <KpiCard label="Finalized reviews" value={finalized.length} tint="var(--ap-green)" />
        <KpiCard label="Current focus areas" value={query.data?.focuses.length ?? 0} tint="var(--ap-fg-muted)" />
      </div>
      {hasSealedInProgress && (
        <Alert>
          <LockKeyhole className="size-4" />
          <AlertTitle>Evaluation in progress — results sealed</AlertTitle>
          <AlertDescription>
            A review cycle is currently open for you. Scores stay sealed until your lead shares a draft or the evaluation is finalized.
          </AlertDescription>
        </Alert>
      )}
      {finalized.length > 0 && latestReport && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={`Competency profile · ${latestReport.cycleName}`}>
            <CompetencyRadar items={radarItems} />
          </SectionCard>
          <SectionCard title="Score trend across cycles">
            <PerformanceTrend points={trendPoints} />
          </SectionCard>
        </div>
      )}
      {(query.data?.focuses ?? []).length > 0 && (
        <SectionCard title="Active growth focuses" contentClassName="space-y-3 px-4 py-4">
          {(query.data?.focuses ?? []).map((focus) => (
            <div key={focus.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--ap-border)' }}>
              <p className="text-sm font-semibold">{focus.criterion.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{focus.targetText}</p>
              {canUpdateFocus && (
                <WeeklyStepForm
                  focusId={focus.id}
                  defaultValue={focus.weeklyStep ?? ''}
                  isPending={updateStep.isPending}
                  onSave={(weeklyStep) => updateStep.mutate({ id: focus.id, weeklyStep })}
                />
              )}
            </div>
          ))}
        </SectionCard>
      )}
      <SectionCard title="Your performance history">
        {query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState bare icon={BarChart3} title="No performance reviews yet" description="Your reviews and growth focuses will appear here." />
        ) : (
          <div className="divide-y divide-border">
            {rows.map((evaluation) => (
              <Link key={evaluation.id} href={`/dashboard/performance/evaluations/${evaluation.id}/score`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{evaluation.cycle.name}</p>
                  <p className="text-xs text-muted-foreground">{evaluation.templateName}</p>
                </div>
                <div className="flex items-center gap-3">
                  {evaluation.normalized != null && <span className="text-sm font-semibold tabular-nums">{evaluation.normalized.toFixed(1)}</span>}
                  <PerformanceStatusBadge status={evaluation.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
