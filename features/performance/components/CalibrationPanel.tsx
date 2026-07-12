'use client'

import { useState } from 'react'
import { Button, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { CalibrationDetail, EvaluationDetail } from '../types'
import { useCalibrationDetail, useEvaluationWorkflow } from '../hooks/queries'
import { SectionCard } from './SectionCard'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

function CalibrationComparisonTable({ calibration }: { calibration: CalibrationDetail }) {
  const evaluators = calibration.assignments
  const scoreByCriterionEvaluator = new Map(calibration.scores.map((score) => [`${score.criterionId}:${score.evaluatorId}`, score]))
  if (calibration.results.length === 0 || evaluators.length === 0) return null
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--ap-border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Criterion</th>
            {evaluators.map((assignment) => (
              <th key={assignment.evaluatorId} className="px-3 py-2 font-medium">
                {assignment.evaluator.name ?? 'Evaluator'}{assignment.role === 'LEAD' ? ' (Lead)' : ''}
              </th>
            ))}
            <th className="px-3 py-2 font-medium">Consolidated</th>
            <th className="px-3 py-2 font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {calibration.results.map((result) => (
            <tr key={result.criterionId} className={cn('border-b border-border last:border-b-0', result.flagged && 'bg-warning-50')}>
              <td className="px-3 py-2">
                <span className="font-medium">{result.criterion.title}</span>
                <span className="ml-1 text-xs text-muted-foreground">/ {result.criterion.maxPoints}</span>
              </td>
              {evaluators.map((assignment) => {
                const score = scoreByCriterionEvaluator.get(`${result.criterionId}:${assignment.evaluatorId}`)
                return (
                  <td key={assignment.evaluatorId} className="px-3 py-2" title={score?.remark ?? undefined}>
                    {score ? score.score : <span className="text-muted-foreground">—</span>}
                  </td>
                )
              })}
              <td className="px-3 py-2 font-medium tabular-nums">{result.consolidated.toFixed(1)}</td>
              <td className={cn('px-3 py-2 tabular-nums', result.flagged && 'font-semibold text-warning-700')}>{result.variance.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CalibrationPanel({ evaluation }: { evaluation: EvaluationDetail }) {
  const workflow = useEvaluationWorkflow(evaluation.id)
  const permissions = usePerformancePermissions()
  const canResolve = permissions.can('button.performance.calibration.resolve', 'criterion_result', 'canWrite')
  const canViewCalibration = permissions.canFeature('module.performance')
    && permissions.canFeature('page.performance.calibration')
    && permissions.canDo('evaluation', 'canRead')
    && permissions.canDo('evaluator_score', 'canRead')
    && permissions.canDo('criterion_result', 'canRead')
  // The API additionally restricts calibration to the lead evaluator / admins and
  // returns 403 otherwise — the query is non-retrying and errors simply hide the view.
  const calibration = useCalibrationDetail(evaluation.id, evaluation.status === 'CALIBRATION' && canViewCalibration)
  const canShare = permissions.can('button.performance.draft.share', 'evaluation_report', 'canShare')
    && permissions.canDo('evaluation_report', 'canCreate')
    && permissions.canDo('evaluation_acknowledgement', 'canCreate')
  const canFinalize = permissions.can('button.performance.evaluation.finalize', 'evaluation', 'canSubmit')
  const flagged = (evaluation.results ?? []).filter((result) => result.flagged && !result.resolvedAt)
  const [notes, setNotes] = useState<Record<string, string>>({})

  if (evaluation.status === 'CALIBRATION') {
    return (
      <SectionCard title="Calibration required" contentClassName="space-y-3 px-4 py-4">
        {calibration.data && !calibration.error && <CalibrationComparisonTable calibration={calibration.data} />}
        {flagged.map((result) => {
          const criterion = evaluation.template?.tiers.flatMap((tier) => tier.criteria).find((item) => item.id === result.criterionId)
          return (
            <div key={result.criterionId} className="rounded-lg border border-warning-200 bg-warning-50 p-3">
              <div className="flex justify-between gap-3"><p className="text-sm font-medium">{criterion?.title ?? 'Flagged criterion'}</p><span className="text-xs tabular-nums">Variance {result.variance.toFixed(1)}</span></div>
              <Textarea className="mt-2" value={notes[result.criterionId] ?? result.calibrationNote ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [result.criterionId]: event.target.value }))} placeholder="Document the calibration resolution" />
            </div>
          )
        })}
        {canResolve && <Button
          onClick={() => workflow.calibrate.mutate(flagged.map((result) => ({ criterionId: result.criterionId, note: notes[result.criterionId] ?? result.calibrationNote ?? '' })))}
          disabled={workflow.calibrate.isPending || flagged.some((result) => !(notes[result.criterionId] ?? result.calibrationNote)?.trim())}
        >
          Resolve calibration
        </Button>}
      </SectionCard>
    )
  }
  if (evaluation.status === 'CONSOLIDATED') {
    return canShare ? (
      <SectionCard contentClassName="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="text-sm text-muted-foreground">Consolidation is complete and ready to share.</p>
        <Button onClick={() => workflow.share.mutate()} disabled={workflow.share.isPending}>Share draft</Button>
      </SectionCard>
    ) : null
  }
  if (evaluation.status === 'DRAFT_SHARED' && evaluation.scores) {
    return canFinalize ? (
      <SectionCard contentClassName="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="text-sm text-muted-foreground">The draft is shared. Finalization requires employee acknowledgement or an administrator override.</p>
        <Button onClick={() => workflow.finalize.mutate(undefined)} disabled={workflow.finalize.isPending}>Finalize</Button>
      </SectionCard>
    ) : null
  }
  return null
}
