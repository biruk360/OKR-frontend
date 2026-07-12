'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQueries } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ExternalLink, FileX2, Info, LockKeyhole, RefreshCw, Save, SearchX, UserX } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog, EmptyState, Input, Label, Textarea, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { performanceApi } from '../services/api'
import { useEvaluation, useMetricActual, useRetryConsolidation, useSaveScores, useSubmitEvaluation } from '../hooks/queries'
import { useExcuseEvaluation } from '../hooks/ui-extras'
import { humanizeEnum, PerformanceStatusBadge } from './PerformanceStatusBadge'
import { PerformanceReport } from './PerformanceReport'
import { CalibrationPanel } from './CalibrationPanel'
import { EvaluationActivityPanel } from './EvaluationActivityPanel'
import { PanelManager } from './PanelManager'
import { SectionCard } from './SectionCard'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type DraftScore = { score: string; remark: string }

/** Debounced autosave fires this long after the last keystroke (blur-save remains the fast path). */
const AUTOSAVE_DELAY_MS = 3000

function MetricActualCell({ evaluationId, criterionId }: { evaluationId: string; criterionId: string }) {
  const query = useMetricActual(evaluationId, criterionId)
  if (query.isLoading) {
    return (
      <div className="space-y-2 md:col-span-3">
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    )
  }
  if (!query.data || query.data.unavailable) {
    return (
      <Alert className="border-warning-200 bg-warning-50 text-warning-800 md:col-span-3">
        <AlertTriangle className="size-4" />
        <AlertTitle>Actual unavailable</AlertTitle>
        <AlertDescription className="text-xs text-warning-800/80">
          {query.data?.reason ?? query.error?.message ?? 'Metric source could not be resolved.'}
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <div className="grid gap-3 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-[repeat(3,minmax(0,1fr))] md:col-span-3">
      <div><p className="text-xs text-muted-foreground">Actual</p><p className="font-semibold tabular-nums">{query.data.actual} {query.data.unit}</p></div>
      <div><p className="text-xs text-muted-foreground">Target</p><p className="font-semibold tabular-nums">{query.data.target} {query.data.unit}</p></div>
      <div><p className="text-xs text-muted-foreground">Computed score</p><p className="font-semibold tabular-nums">{query.data.score?.toFixed(2)}</p></div>
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

/** Anchor values are strings or bilingual `{ en, am }` objects — render the English text. */
function anchorText(value: unknown): string {
  if (value && typeof value === 'object') {
    const en = (value as { en?: unknown }).en
    return typeof en === 'string' ? en : ''
  }
  return value == null ? '' : String(value)
}

/** Formatted rubric-anchor popover, listed in ascending score order (0, 4, 7, 10). */
function AnchorPopover({ anchorJson }: { anchorJson: Record<string, unknown> | null }) {
  const entries = Object.entries(anchorJson ?? {})
    .map(([key, value]) => ({ key, order: Number(key), text: anchorText(value) }))
    .sort((a, b) => (Number.isFinite(a.order) && Number.isFinite(b.order) ? a.order - b.order : a.key.localeCompare(b.key)))
  if (entries.length === 0) return null
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="View rubric anchors"><Info className="size-3.5 text-muted-foreground" /></button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <div className="space-y-1.5 py-1">
            {entries.map((entry) => (
              <div key={entry.key} className="flex items-start gap-2 text-xs">
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{entry.key}</span>
                <span className="flex-1">{entry.text || '—'}</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function ScoringWorkspace({ evaluationId }: { evaluationId: string }) {
  const { data: session } = useSession()
  const query = useEvaluation(evaluationId)
  const save = useSaveScores(evaluationId)
  const submit = useSubmitEvaluation(evaluationId)
  const retryConsolidation = useRetryConsolidation(evaluationId)
  const permissions = usePerformancePermissions()
  const canSave = permissions.can('button.performance.score.save', 'evaluator_score', 'canWrite')
    && permissions.canDo('evaluator_score', 'canCreate')
  const canSubmit = permissions.can('button.performance.score.submit', 'evaluator_score', 'canSubmit')
  const canManagePanel = permissions.can('button.performance.panel.manage', 'evaluator_assignment', 'canWrite')
    && permissions.canDo('evaluator_assignment', 'canCreate')
    && permissions.canDo('evaluator_assignment', 'canDelete')
  const canRetryConsolidation = permissions.canFeature('module.performance')
    && permissions.canDo('evaluation', 'canRead')
    && permissions.canDo('criterion_result', 'canWrite')
  const excuse = useExcuseEvaluation(evaluationId)
  const canExcuse = permissions.canFeature('module.performance') && permissions.canDo('evaluation', 'canSubmit')
  const [excuseOpen, setExcuseOpen] = useState(false)
  const [excuseReason, setExcuseReason] = useState('')
  const [drafts, setDrafts] = useState<Record<string, DraftScore>>({})
  const [clampHints, setClampHints] = useState<Record<string, string>>({})
  // Criterion ids edited since the last save — drained by blur-save and the debounced autosave.
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set())
  const saveScoresBatch = save.mutateAsync

  useEffect(() => {
    if (!query.data?.scores) return
    const next: Record<string, DraftScore> = {}
    for (const score of query.data.scores) next[score.criterionId] = { score: String(score.score), remark: score.remark ?? '' }
    setDrafts(next)
  }, [query.data?.scores])

  // Auto-computed METRIC criteria: their scores come from useMetricActual queries
  // (shared with each MetricActualCell via identical query keys), so the header
  // total can include them once resolved.
  const scoringView = !!query.data && !query.data.sealed && !!query.data.template && !!query.data.scores
  const autoCriteria = useMemo(
    () => (query.data?.template?.tiers ?? [])
      .flatMap((tier) => tier.criteria)
      .filter((criterion) => criterion.type === 'METRIC' && criterion.scoringRuleJson?.type !== 'MANUAL'),
    [query.data],
  )
  const metricQueries = useQueries({
    queries: autoCriteria.map((criterion) => ({
      queryKey: ['performance', 'metric-actual', evaluationId, criterion.id] as const,
      queryFn: () => performanceApi.getMetricActual(evaluationId, criterion.id),
      enabled: scoringView,
    })),
  })

  // Timed autosave: ~3s after the last keystroke, flush every dirty draft in one
  // batched save. The timer resets on each draft change; dirty ids clear on flush
  // (and on blur-save) so rows are never double-saved.
  useEffect(() => {
    if (dirtyIds.size === 0) return
    const criteria = (query.data?.template?.tiers ?? []).flatMap((tier) => tier.criteria)
    const maxByCriterion = new Map(criteria.map((criterion) => [criterion.id, criterion.maxPoints]))
    const timer = window.setTimeout(() => {
      const rows = Array.from(dirtyIds).flatMap((criterionId) => {
        const draft = drafts[criterionId]
        if (!draft || draft.score === '') return []
        const raw = Number(draft.score)
        if (!Number.isFinite(raw)) return []
        const max = maxByCriterion.get(criterionId)
        return [{ criterionId, score: max === undefined ? raw : Math.min(Math.max(raw, 0), max), remark: draft.remark }]
      })
      setDirtyIds(new Set())
      if (rows.length > 0) void saveScoresBatch(rows).catch(() => { /* onError already toasts */ })
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dirtyIds, drafts, query.data, saveScoresBatch])

  function markDirty(criterionId: string) {
    setDirtyIds((current) => { const next = new Set(current); next.add(criterionId); return next })
  }
  function clearDirty(criterionId: string) {
    setDirtyIds((current) => {
      if (!current.has(criterionId)) return current
      const next = new Set(current); next.delete(criterionId); return next
    })
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-[14px]" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }
  const evaluation = query.data
  if (!evaluation) {
    return <EmptyState icon={SearchX} title="Evaluation not found" description="This evaluation does not exist or you do not have access to it." />
  }
  if (evaluation.sealed) {
    return <EmptyState icon={LockKeyhole} title="Evaluation in progress" description="Scores remain sealed until the draft report is shared." />
  }
  if (!evaluation.template) {
    return <EmptyState icon={FileX2} title="Scorecard unavailable" description="No scorecard template is attached to this evaluation." />
  }
  if (!evaluation.scores && evaluation.report) {
    return (
      <div className="space-y-4">
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border bg-card px-4 py-4"
          style={{ borderColor: 'var(--ap-border)' }}
        >
          <div>
            <div className="flex items-center gap-2"><h2 className="text-lg font-semibold" style={{ letterSpacing: '-0.01em' }}>{evaluation.employee.name}</h2><PerformanceStatusBadge status={evaluation.status} /></div>
            <p className="text-[13px] text-muted-foreground">{evaluation.cycle.name} · {evaluation.template.family.name}</p>
          </div>
        </div>
        <PerformanceReport evaluation={evaluation} />
        <EvaluationActivityPanel evaluationId={evaluationId} />
      </div>
    )
  }
  const ownAssignment = evaluation.assignments?.find((assignment) => assignment.evaluatorId === session?.user?.id)
  const assignmentLocked = ['CONSOLIDATED', 'CALIBRATION', 'DRAFT_SHARED', 'FINALIZED'].includes(evaluation.status)
    || ownAssignment?.status === 'SUBMITTED'
  const panelEditable = ['ASSIGNED', 'IN_PROGRESS'].includes(evaluation.status) && evaluation.cycle.status === 'OPEN'
  const consolidationStuck = ['ASSIGNED', 'IN_PROGRESS'].includes(evaluation.status)
    && (evaluation.assignments?.length ?? 0) > 0
    && (evaluation.assignments ?? []).every((assignment) => assignment.status === 'SUBMITTED')

  // Running raw grand total across all tiers: draft (rubric + manual metric)
  // scores plus auto-metric computed scores once their queries resolve.
  const draftTotal = evaluation.template.tiers.reduce(
    (sum, tier) => sum + tier.criteria.reduce((tierSum, criterion) => tierSum + Number(drafts[criterion.id]?.score || 0), 0),
    0,
  )
  const resolvedMetricScores = metricQueries
    .map((metricQuery) => metricQuery.data?.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
  const pendingMetricCount = autoCriteria.length - resolvedMetricScores.length
  const grandTotal = draftTotal + resolvedMetricScores.reduce((sum, score) => sum + score, 0)
  const totalCaption = pendingMetricCount === 0
    ? 'Running raw total'
    : pendingMetricCount === autoCriteria.length
      ? 'Running raw total · rubric + manual only'
      : `Running raw total · ${pendingMetricCount} metric score${pendingMetricCount === 1 ? '' : 's'} unresolved`

  async function saveCriterion(criterionId: string) {
    const draft = drafts[criterionId]
    if (!draft || draft.score === '') return
    clearDirty(criterionId)
    await save.mutateAsync([{ criterionId, score: Number(draft.score), remark: draft.remark }])
  }

  /**
   * Client-side clamp on blur: scores above maxPoints (or below 0) are clamped
   * with a brief inline hint. Server validation remains the backstop.
   */
  function clampAndSave(criterion: { id: string; maxPoints: number }) {
    const draft = drafts[criterion.id]
    if (!draft || draft.score === '') return
    const raw = Number(draft.score)
    if (Number.isFinite(raw)) {
      const clamped = Math.min(Math.max(raw, 0), criterion.maxPoints)
      if (clamped !== raw) {
        clearDirty(criterion.id)
        setDrafts((current) => ({ ...current, [criterion.id]: { score: String(clamped), remark: current[criterion.id]?.remark ?? '' } }))
        setClampHints((current) => ({ ...current, [criterion.id]: `Adjusted to ${clamped} — allowed range is 0–${criterion.maxPoints}.` }))
        window.setTimeout(() => setClampHints((current) => {
          const { [criterion.id]: _omit, ...rest } = current
          return rest
        }), 4000)
        void save.mutateAsync([{ criterionId: criterion.id, score: clamped, remark: draft.remark }])
        return
      }
    }
    void saveCriterion(criterion.id)
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border bg-card px-4 py-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div>
          <div className="flex items-center gap-2"><h2 className="text-lg font-semibold" style={{ letterSpacing: '-0.01em' }}>{evaluation.employee.name}</h2><PerformanceStatusBadge status={evaluation.status} /></div>
          <p className="text-[13px] text-muted-foreground">{evaluation.cycle.name} · {evaluation.template.family.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">{grandTotal.toFixed(1)} / {evaluation.template.maxTotal}</p>
            <p className="text-[11px] text-muted-foreground">{totalCaption}</p>
          </div>
          {canExcuse && !['EXCUSED', 'FINALIZED'].includes(evaluation.status) && (
            <Button size="sm" variant="outline" onClick={() => { setExcuseReason(''); setExcuseOpen(true) }}>
              <UserX className="mr-1 size-3.5" /> Excuse evaluation
            </Button>
          )}
          {canManagePanel && panelEditable && <PanelManager evaluation={evaluation} />}
          {canRetryConsolidation && consolidationStuck && (
            <Button size="sm" variant="outline" onClick={() => retryConsolidation.mutate()} disabled={retryConsolidation.isPending}>
              <RefreshCw className="mr-1 size-3.5" /> Retry consolidation
            </Button>
          )}
          {canSubmit && !assignmentLocked && <Button onClick={() => submit.mutate()} disabled={submit.isPending}><CheckCircle2 className="mr-2 size-4" /> Submit scores</Button>}
        </div>
      </div>
      <CalibrationPanel evaluation={evaluation} />
      {evaluation.template.tiers.map((tier) => {
        const subtotal = tier.criteria.reduce((sum, criterion) => sum + Number(drafts[criterion.id]?.score || 0), 0)
        return (
          <SectionCard
            key={tier.id}
            title={tier.name}
            actions={<span className="text-sm font-semibold tabular-nums">{subtotal.toFixed(1)} / {tier.maxPoints}</span>}
            contentClassName="space-y-3 px-4 py-4"
          >
            {tier.criteria.map((criterion) => {
              const auto = criterion.type === 'METRIC' && criterion.scoringRuleJson?.type !== 'MANUAL'
              return (
                <div key={criterion.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_8rem_1.2fr_auto]" style={{ borderColor: 'var(--ap-border)' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{criterion.title}</p>
                      {criterion.type === 'RUBRIC' && <AnchorPopover anchorJson={criterion.anchorJson} />}
                    </div>
                    <p className="text-xs text-muted-foreground">{humanizeEnum(criterion.type)} · max {criterion.maxPoints}</p>
                  </div>
                  {auto ? <MetricActualCell evaluationId={evaluationId} criterionId={criterion.id} /> : (
                    <>
                      <div>
                        <Input
                          data-score-input
                          type="number"
                          min={0}
                          max={criterion.maxPoints}
                          step="0.1"
                          value={drafts[criterion.id]?.score ?? ''}
                          disabled={assignmentLocked || !canSave}
                          placeholder="Score"
                          onChange={(event) => {
                            markDirty(criterion.id)
                            setDrafts((current) => ({ ...current, [criterion.id]: { score: event.target.value, remark: current[criterion.id]?.remark ?? '' } }))
                          }}
                          onBlur={() => clampAndSave(criterion)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                            // Prevent the number input's default increment/decrement — Up/Down navigate the grid.
                            event.preventDefault()
                            const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-score-input]:not(:disabled)'))
                            const index = inputs.indexOf(event.currentTarget)
                            const delta = event.key === 'ArrowUp' ? -1 : 1
                            inputs[index + delta]?.focus()
                          }}
                        />
                        {clampHints[criterion.id] && <p className="mt-1 text-[11px] text-warning-700">{clampHints[criterion.id]}</p>}
                      </div>
                      <Textarea
                        value={drafts[criterion.id]?.remark ?? ''}
                        disabled={assignmentLocked || !canSave}
                        placeholder="Optional criterion remark"
                        onChange={(event) => {
                          markDirty(criterion.id)
                          setDrafts((current) => ({ ...current, [criterion.id]: { score: current[criterion.id]?.score ?? '', remark: event.target.value } }))
                        }}
                        onBlur={() => saveCriterion(criterion.id)}
                      />
                      {canSave && <Button variant="outline" size="sm" disabled={assignmentLocked || save.isPending} onClick={() => saveCriterion(criterion.id)}><Save className="size-3.5" /></Button>}
                    </>
                  )}
                </div>
              )
            })}
          </SectionCard>
        )
      })}
      <EvaluationActivityPanel evaluationId={evaluationId} />
      <ConfirmDialog
        open={excuseOpen}
        onClose={() => { setExcuseOpen(false); setExcuseReason('') }}
        onConfirm={async () => {
          if (!excuseReason.trim()) return
          try {
            await excuse.mutateAsync(excuseReason.trim())
            setExcuseOpen(false)
            setExcuseReason('')
          } catch { /* onError already toasts; keep the dialog open */ }
        }}
        title="Excuse evaluation"
        message={`Excuse ${evaluation.employee.name} from this review cycle?`}
        description="The evaluation is removed from evaluator queues and excluded from cycle completion. This is an administrator action — provide a reason for the audit trail."
        variant="danger"
        icon={UserX}
        confirmLabel="Excuse evaluation"
        isLoading={excuse.isPending}
        disabled={!excuseReason.trim()}
        extraContent={
          <div>
            <Label>Reason</Label>
            <Textarea value={excuseReason} onChange={(event) => setExcuseReason(event.target.value)} placeholder="Why is this evaluation being excused?" />
          </div>
        }
      />
    </div>
  )
}
