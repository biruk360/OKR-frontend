'use client'

import { useForm } from 'react-hook-form'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { KpiCard } from '@/components/ui/dashboard'
import type { EvaluationDetail, EvaluationReportContent } from '../types'
import { useEvaluationResponse } from '../hooks/queries'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'
import { CompetencyRadar, radarItemsFromTierBreakdown } from './CompetencyRadar'
import { PerformanceTrend, type PerformanceTrendChartPoint } from './PerformanceTrend'
import { OkrAttainmentSection } from './OkrAttainmentSection'
import { SectionCard } from './SectionCard'

export function PerformanceReport({ evaluation }: { evaluation: EvaluationDetail }) {
  const response = useEvaluationResponse(evaluation.id)
  const permissions = usePerformancePermissions()
  const canAcknowledge = permissions.can('button.performance.report.acknowledge', 'evaluation_acknowledgement', 'canSubmit')
    && permissions.canDo('evaluation_acknowledgement', 'canWrite')
  const canDispute = permissions.can('button.performance.report.dispute', 'evaluation_acknowledgement', 'canSubmit')
    && permissions.canDo('evaluation_acknowledgement', 'canWrite')
  const { register, getValues, setError, clearErrors, formState: { errors } } = useForm<{ comment: string }>({
    defaultValues: { comment: '' },
  })
  const report = evaluation.report?.contentJson as EvaluationReportContent | undefined
  if (!report) return null
  const radarItems = radarItemsFromTierBreakdown(report.tierBreakdown)
  const trendPoints: PerformanceTrendChartPoint[] = [
    ...(report.trend ?? []),
    ...(report.normalized == null ? [] : [{
      cycleName: evaluation.cycle.name,
      periodEnd: evaluation.cycle.periodEnd,
      normalized: report.normalized,
    }]),
  ]

  function acknowledge() {
    clearErrors('comment')
    response.acknowledge.mutate(getValues('comment'))
  }

  function dispute() {
    const comment = getValues('comment')
    if (!comment.trim()) {
      setError('comment', { type: 'required', message: 'A comment is required to dispute the draft.' })
      return
    }
    clearErrors('comment')
    response.dispute.mutate(comment)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Normalized score" value={report.normalized == null ? '—' : report.normalized.toFixed(1)} tint="var(--ap-accent)" />
        <KpiCard label="Decision band" value={report.decisionBand ?? '—'} tint={report.gatekeeperPass ? 'var(--ap-green)' : 'var(--ap-red)'} />
        <KpiCard label="Gatekeeper" value={report.gatekeeperPass ? 'Passed' : 'Not passed'} tint={report.gatekeeperPass ? 'var(--ap-green)' : 'var(--ap-red)'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Competency profile">
          <CompetencyRadar items={radarItems} />
        </SectionCard>
        <SectionCard title="Score trend across cycles">
          <PerformanceTrend points={trendPoints} />
        </SectionCard>
      </div>
      {report.okrAttainment && <OkrAttainmentSection attainment={report.okrAttainment} />}
      {(report.tierBreakdown ?? []).map((tier) => (
        <SectionCard
          key={tier.id}
          title={tier.name}
          actions={<span className="text-sm font-semibold tabular-nums">{tier.subtotal.toFixed(1)} / {tier.maxPoints}</span>}
          contentClassName="divide-y divide-border px-4 py-2"
        >
          {tier.criteria.map((criterion) => (
            <div key={criterion.id} className="py-3">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{criterion.title}</p><span className="text-sm font-semibold tabular-nums">{criterion.consolidated?.toFixed(1) ?? '—'} / {criterion.maxPoints}</span></div>
              {criterion.feedbackSummary && <p className="mt-1 text-xs text-muted-foreground">{criterion.feedbackSummary}</p>}
            </div>
          ))}
        </SectionCard>
      ))}
      {evaluation.status === 'DRAFT_SHARED' && (canAcknowledge || canDispute) && (
        <SectionCard title="Respond to shared draft" contentClassName="space-y-3 px-4 py-4">
          <div>
            <Input
              {...register('comment')}
              placeholder="Optional acknowledgement comment; required for dispute"
              aria-invalid={!!errors.comment}
            />
            {errors.comment && <p className="mt-1 text-xs text-danger-600">{errors.comment.message}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canAcknowledge && <Button onClick={acknowledge} disabled={response.acknowledge.isPending}><CheckCircle2 className="mr-2 size-4" /> Acknowledge</Button>}
            {canDispute && <Button variant="outline" onClick={dispute} disabled={response.dispute.isPending}><AlertTriangle className="mr-2 size-4" /> Dispute</Button>}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
