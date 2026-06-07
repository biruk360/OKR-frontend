'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Info, LockKeyhole, Save } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Textarea, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { useEvaluation, useMetricActual, useSaveScores, useSubmitEvaluation } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { PerformanceReport } from './PerformanceReport'
import { CalibrationPanel } from './CalibrationPanel'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type DraftScore = { score: string; remark: string }

function MetricActualCell({ evaluationId, criterionId }: { evaluationId: string; criterionId: string }) {
  const query = useMetricActual(evaluationId, criterionId)
  if (query.isLoading) return <p className="text-sm text-muted-foreground md:col-span-3">Resolving period-bounded Key Result actual...</p>
  if (!query.data || query.data.unavailable) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 md:col-span-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div><p className="font-medium">Actual unavailable</p><p className="text-xs">{query.data?.reason ?? query.error?.message ?? 'Metric source could not be resolved.'}</p></div>
      </div>
    )
  }
  return (
    <div className="grid gap-3 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-[repeat(3,minmax(0,1fr))] md:col-span-3">
      <div><p className="text-xs text-muted-foreground">Actual</p><p className="font-semibold">{query.data.actual} {query.data.unit}</p></div>
      <div><p className="text-xs text-muted-foreground">Target</p><p className="font-semibold">{query.data.target} {query.data.unit}</p></div>
      <div><p className="text-xs text-muted-foreground">Computed score</p><p className="font-semibold">{query.data.score?.toFixed(2)}</p></div>
      <div className="sm:col-span-3">
        <p className="text-xs text-muted-foreground">Sources</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {query.data.sources.map((source) => (
            <Link key={source.keyResultId} href={`/dashboard/key-results/${source.keyResultId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {source.title}: {source.value} <ExternalLink className="size-3" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ScoringWorkspace({ evaluationId }: { evaluationId: string }) {
  const query = useEvaluation(evaluationId)
  const save = useSaveScores(evaluationId)
  const submit = useSubmitEvaluation(evaluationId)
  const permissions = usePerformancePermissions()
  const canSave = permissions.can('button.performance.score.save', 'evaluator_score', 'canWrite')
    && permissions.canDo('evaluator_score', 'canCreate')
  const canSubmit = permissions.can('button.performance.score.submit', 'evaluator_score', 'canSubmit')
  const [drafts, setDrafts] = useState<Record<string, DraftScore>>({})

  useEffect(() => {
    if (!query.data?.scores) return
    const next: Record<string, DraftScore> = {}
    for (const score of query.data.scores) next[score.criterionId] = { score: String(score.score), remark: score.remark ?? '' }
    setDrafts(next)
  }, [query.data?.scores])

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading evaluation...</p>
  const evaluation = query.data
  if (!evaluation) return <EmptyState title="Evaluation not found" />
  if (evaluation.sealed) {
    return <EmptyState icon={LockKeyhole} title="Evaluation in progress" description="Scores remain sealed until the draft report is shared." />
  }
  if (!evaluation.template) return <EmptyState title="Scorecard unavailable" />
  if (!evaluation.scores && evaluation.report) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{evaluation.employee.name}</h2><PerformanceStatusBadge status={evaluation.status} /></div>
              <p className="text-sm text-muted-foreground">{evaluation.cycle.name} · {evaluation.template.family.name}</p>
            </div>
          </CardContent>
        </Card>
        <PerformanceReport evaluation={evaluation} />
      </div>
    )
  }
  const assignmentLocked = ['CONSOLIDATED', 'CALIBRATION', 'DRAFT_SHARED', 'FINALIZED'].includes(evaluation.status)

  async function saveCriterion(criterionId: string) {
    const draft = drafts[criterionId]
    if (!draft || draft.score === '') return
    await save.mutateAsync([{ criterionId, score: Number(draft.score), remark: draft.remark }])
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div>
            <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{evaluation.employee.name}</h2><PerformanceStatusBadge status={evaluation.status} /></div>
            <p className="text-sm text-muted-foreground">{evaluation.cycle.name} · {evaluation.template.family.name}</p>
          </div>
          {canSubmit && !assignmentLocked && <Button onClick={() => submit.mutate()} disabled={submit.isPending}><CheckCircle2 className="mr-2 size-4" /> Submit scores</Button>}
        </CardContent>
      </Card>
      <CalibrationPanel evaluation={evaluation} />
      {evaluation.template.tiers.map((tier) => {
        const subtotal = tier.criteria.reduce((sum, criterion) => sum + Number(drafts[criterion.id]?.score || 0), 0)
        return (
          <Card key={tier.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between"><CardTitle className="text-base">{tier.name}</CardTitle><span className="text-sm font-semibold">{subtotal.toFixed(1)} / {tier.maxPoints}</span></div>
            </CardHeader>
            <CardContent className="space-y-3">
              {tier.criteria.map((criterion) => {
                const auto = criterion.type === 'METRIC' && criterion.scoringRuleJson?.type !== 'MANUAL'
                return (
                  <div key={criterion.id} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_8rem_1.2fr_auto]">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{criterion.title}</p>
                        {criterion.type === 'RUBRIC' && (
                          <TooltipProvider>
                            <Tooltip><TooltipTrigger asChild><button type="button"><Info className="size-3.5 text-muted-foreground" /></button></TooltipTrigger><TooltipContent className="max-w-sm"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(criterion.anchorJson, null, 2)}</pre></TooltipContent></Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{criterion.type} · max {criterion.maxPoints}</p>
                    </div>
                    {auto ? <MetricActualCell evaluationId={evaluationId} criterionId={criterion.id} /> : (
                      <>
                        <Input
                          data-score-input
                          type="number"
                          min={0}
                          max={criterion.maxPoints}
                          step="0.1"
                          value={drafts[criterion.id]?.score ?? ''}
                          disabled={assignmentLocked || !canSave}
                          placeholder="Score"
                          onChange={(event) => setDrafts((current) => ({ ...current, [criterion.id]: { score: event.target.value, remark: current[criterion.id]?.remark ?? '' } }))}
                          onBlur={() => saveCriterion(criterion.id)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return
                            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-score-input]:not(:disabled)'))
                            const index = inputs.indexOf(event.currentTarget)
                            inputs[index + 1]?.focus()
                          }}
                        />
                        <Textarea
                          value={drafts[criterion.id]?.remark ?? ''}
                          disabled={assignmentLocked || !canSave}
                          placeholder="Optional criterion remark"
                          onChange={(event) => setDrafts((current) => ({ ...current, [criterion.id]: { score: current[criterion.id]?.score ?? '', remark: event.target.value } }))}
                          onBlur={() => saveCriterion(criterion.id)}
                        />
                        {canSave && <Button variant="outline" size="sm" disabled={assignmentLocked || save.isPending} onClick={() => saveCriterion(criterion.id)}><Save className="size-3.5" /></Button>}
                      </>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
