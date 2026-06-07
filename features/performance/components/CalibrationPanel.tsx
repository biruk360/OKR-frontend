'use client'

import { useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import type { EvaluationDetail } from '../types'
import { useEvaluationWorkflow } from '../hooks/queries'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

export function CalibrationPanel({ evaluation }: { evaluation: EvaluationDetail }) {
  const workflow = useEvaluationWorkflow(evaluation.id)
  const permissions = usePerformancePermissions()
  const canResolve = permissions.can('button.performance.calibration.resolve', 'criterion_result', 'canWrite')
  const canShare = permissions.can('button.performance.draft.share', 'evaluation_report', 'canShare')
    && permissions.canDo('evaluation_report', 'canCreate')
    && permissions.canDo('evaluation_acknowledgement', 'canCreate')
  const canFinalize = permissions.can('button.performance.evaluation.finalize', 'evaluation', 'canSubmit')
  const flagged = (evaluation.results ?? []).filter((result) => result.flagged && !result.resolvedAt)
  const [notes, setNotes] = useState<Record<string, string>>({})

  if (evaluation.status === 'CALIBRATION') {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Calibration required</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {flagged.map((result) => {
            const criterion = evaluation.template?.tiers.flatMap((tier) => tier.criteria).find((item) => item.id === result.criterionId)
            return (
              <div key={result.criterionId} className="rounded-lg border border-warning-200 bg-warning-50 p-3">
                <div className="flex justify-between gap-3"><p className="text-sm font-medium">{criterion?.title ?? 'Flagged criterion'}</p><span className="text-xs">Variance {result.variance.toFixed(1)}</span></div>
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
        </CardContent>
      </Card>
    )
  }
  if (evaluation.status === 'CONSOLIDATED') {
    return canShare ? <Card><CardContent className="flex items-center justify-between gap-3 pt-6"><p className="text-sm text-muted-foreground">Consolidation is complete and ready to share.</p><Button onClick={() => workflow.share.mutate()} disabled={workflow.share.isPending}>Share draft</Button></CardContent></Card> : null
  }
  if (evaluation.status === 'DRAFT_SHARED' && evaluation.scores) {
    return canFinalize ? <Card><CardContent className="flex items-center justify-between gap-3 pt-6"><p className="text-sm text-muted-foreground">The draft is shared. Finalization requires employee acknowledgement or an administrator override.</p><Button onClick={() => workflow.finalize.mutate(undefined)} disabled={workflow.finalize.isPending}>Finalize</Button></CardContent></Card> : null
  }
  return null
}
