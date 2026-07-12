'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, FileX2, Library, Plus, Save, Trash2 } from 'lucide-react'
import { Button, EmptyState, Input, Label, Textarea } from '@/components/ui'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { useInsertCultureBlock, usePerformanceTemplate, useSaveTemplateBuilder } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { MetricMappingManager } from './MetricMappingManager'
import { NativeSelect } from './NativeSelect'
import { TemplateScoringSettings } from './TemplateScoringSettings'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type BuilderCriterion = {
  type: 'RUBRIC' | 'METRIC'
  code?: string
  title: string
  maxPoints: number
  anchorJson?: Record<string, string>
  target?: number
  unit?: string
  periodLabel?: string
  scoringRuleJson?: Record<string, unknown>
  krAggregation?: string
}
type BuilderTier = { id?: string; name: string; maxPoints: number; criteria: BuilderCriterion[] }

/** Matches the JSON shapes accepted by lib/performance/template-validation.ts parseMetricRule. */
type MetricRuleBand = { maxActual: number | null; score: number }
type MetricRuleDraft = { type?: string; maxScore?: number; bands?: MetricRuleBand[] }

const DEFAULT_RULES: Record<string, Record<string, unknown>> = {
  LINEAR_CAPPED: { type: 'LINEAR_CAPPED', maxScore: 10 },
  INVERSE_BANDS: { type: 'INVERSE_BANDS', bands: [{ maxActual: 0, score: 10 }, { maxActual: 1, score: 5 }, { maxActual: null, score: 0 }] },
  MANUAL: { type: 'MANUAL' },
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

const newRubric = (): BuilderCriterion => ({
  type: 'RUBRIC',
  title: '',
  maxPoints: 10,
  anchorJson: { '0': '', '4': '', '7': '', '10': '' },
})

export function TemplateBuilder({ templateId }: { templateId: string }) {
  const query = usePerformanceTemplate(templateId)
  const save = useSaveTemplateBuilder(templateId)
  const culture = useInsertCultureBlock(templateId)
  const permissions = usePerformancePermissions()
  const [tiers, setTiers] = useState<BuilderTier[]>([])

  useEffect(() => {
    if (!query.data) return
    setTiers(query.data.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      maxPoints: tier.maxPoints,
      criteria: tier.criteria.map((criterion) => ({
        type: criterion.type,
        code: criterion.code ?? undefined,
        title: criterion.title,
        maxPoints: criterion.maxPoints,
        anchorJson: criterion.anchorJson as Record<string, string> | undefined,
        target: criterion.target ?? undefined,
        unit: criterion.unit ?? undefined,
        periodLabel: criterion.periodLabel ?? undefined,
        scoringRuleJson: criterion.scoringRuleJson ?? undefined,
        krAggregation: criterion.krAggregation ?? undefined,
      })),
    })))
  }, [query.data])

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-[14px]" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }
  if (!query.data) return <EmptyState icon={FileX2} title="Template not found" description="This template does not exist or you do not have access to it." />
  const editable = query.data.status === 'DRAFT'
    && permissions.can('button.performance.template.edit', 'scorecard_template', 'canWrite')
    && permissions.canDo('scorecard_tier', 'canWrite')
    && permissions.canDo('scorecard_tier', 'canCreate')
    && permissions.canDo('scorecard_tier', 'canDelete')
    && permissions.canDo('scorecard_criterion', 'canWrite')
    && permissions.canDo('scorecard_criterion', 'canCreate')
    && permissions.canDo('scorecard_criterion', 'canDelete')
  const canMapMetrics = permissions.can('button.performance.template.map-metric', 'metric_source_mapping', 'canWrite')
    && permissions.canDo('scorecard_template', 'canWrite')
  const canInsertCulture = editable && permissions.canDo('criterion_library_entry', 'canCreate')

  function updateTier(index: number, patch: Partial<BuilderTier>) {
    setTiers((current) => current.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier))
  }
  function updateCriterion(tierIndex: number, criterionIndex: number, patch: Partial<BuilderCriterion>) {
    setTiers((current) => current.map((tier, index) => index === tierIndex
      ? { ...tier, criteria: tier.criteria.map((criterion, cIndex) => cIndex === criterionIndex ? { ...criterion, ...patch } : criterion) }
      : tier))
  }
  // Position persists via the full-replace builder PUT: it derives from array order.
  function moveTier(index: number, delta: number) {
    setTiers((current) => moveItem(current, index, index + delta))
  }
  function moveCriterion(tierIndex: number, criterionIndex: number, delta: number) {
    setTiers((current) => current.map((tier, index) => index === tierIndex
      ? { ...tier, criteria: moveItem(tier.criteria, criterionIndex, criterionIndex + delta) }
      : tier))
  }
  function updateMetricRule(tierIndex: number, criterionIndex: number, rule: MetricRuleDraft, patch: Partial<MetricRuleDraft>) {
    updateCriterion(tierIndex, criterionIndex, { scoringRuleJson: { ...rule, ...patch } as Record<string, unknown> })
  }

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border bg-card px-4 py-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold" style={{ letterSpacing: '-0.01em' }}>{query.data.family.name}</h2>
            <PerformanceStatusBadge status={query.data.status} />
          </div>
          <p className="text-[13px] text-muted-foreground">Version {query.data.version} · {query.data.maxTotal} max points</p>
        </div>
        {editable && <Button onClick={() => save.mutate(tiers)} disabled={save.isPending}><Save className="mr-2 size-4" /> Save builder</Button>}
      </div>

      {tiers.map((tier, tierIndex) => (
        <section key={tierIndex} className="rounded-[14px] border bg-card" style={{ borderColor: 'var(--ap-border)' }}>
          <div className="space-y-2 px-4 pt-4 pb-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_10rem]">
                <div><Label>Tier name</Label><Input value={tier.name} disabled={!editable} onChange={(event) => updateTier(tierIndex, { name: event.target.value })} /></div>
                <div><Label>Tier max points</Label><Input type="number" value={tier.maxPoints} disabled={!editable} onChange={(event) => updateTier(tierIndex, { maxPoints: Number(event.target.value) })} /></div>
              </div>
              {editable && (
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={tierIndex === 0} aria-label="Move tier up" onClick={() => moveTier(tierIndex, -1)}><ArrowUp className="size-4" /></Button>
                  <Button variant="outline" size="sm" disabled={tierIndex === tiers.length - 1} aria-label="Move tier down" onClick={() => moveTier(tierIndex, 1)}><ArrowDown className="size-4" /></Button>
                  <Button variant="outline" size="sm" aria-label="Delete tier" onClick={() => setTiers((current) => current.filter((_, index) => index !== tierIndex))}><Trash2 className="size-4" /></Button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Criterion total: <span className="tabular-nums">{tier.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)}</span>
            </p>
          </div>
          <div className="space-y-4 px-4 pb-4">
            {tier.criteria.map((criterion, criterionIndex) => (
              <div key={criterionIndex} className="rounded-lg border p-4" style={{ borderColor: 'var(--ap-border)' }}>
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem_auto]">
                  <div>
                    <Label>Type</Label>
                    <NativeSelect
                      value={criterion.type}
                      disabled={!editable}
                      onChange={(event) => updateCriterion(tierIndex, criterionIndex, {
                        type: event.target.value as 'RUBRIC' | 'METRIC',
                        ...(event.target.value === 'RUBRIC'
                          ? { maxPoints: 10, anchorJson: { '0': '', '4': '', '7': '', '10': '' } }
                          : { scoringRuleJson: { type: 'LINEAR_CAPPED', maxScore: 10 }, krAggregation: 'AVG' }),
                      })}
                    >
                      <option value="RUBRIC">Rubric</option>
                      <option value="METRIC">Metric</option>
                    </NativeSelect>
                  </div>
                  <div><Label>Criterion title</Label><Input value={criterion.title} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { title: event.target.value })} /></div>
                  <div><Label>Max points</Label><Input type="number" value={criterion.maxPoints} disabled={!editable || criterion.type === 'RUBRIC'} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { maxPoints: Number(event.target.value) })} /></div>
                  {editable && (
                    <div className="mt-6 flex gap-1">
                      <Button variant="outline" size="sm" disabled={criterionIndex === 0} aria-label="Move criterion up" onClick={() => moveCriterion(tierIndex, criterionIndex, -1)}><ArrowUp className="size-4" /></Button>
                      <Button variant="outline" size="sm" disabled={criterionIndex === tier.criteria.length - 1} aria-label="Move criterion down" onClick={() => moveCriterion(tierIndex, criterionIndex, 1)}><ArrowDown className="size-4" /></Button>
                      <Button variant="outline" size="sm" aria-label="Delete criterion" onClick={() => updateTier(tierIndex, { criteria: tier.criteria.filter((_, index) => index !== criterionIndex) })}><Trash2 className="size-4" /></Button>
                    </div>
                  )}
                </div>
                {criterion.type === 'RUBRIC' ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {['0', '4', '7', '10'].map((anchor) => (
                      <div key={anchor}>
                        <Label>{anchor} anchor</Label>
                        <Textarea
                          value={criterion.anchorJson?.[anchor] ?? ''}
                          disabled={!editable}
                          onChange={(event) => updateCriterion(tierIndex, criterionIndex, {
                            anchorJson: { ...(criterion.anchorJson ?? {}), [anchor]: event.target.value },
                          })}
                        />
                      </div>
                    ))}
                  </div>
                ) : (() => {
                  const rule = (criterion.scoringRuleJson ?? DEFAULT_RULES.LINEAR_CAPPED) as MetricRuleDraft
                  const ruleType = typeof rule.type === 'string' ? rule.type : 'LINEAR_CAPPED'
                  const bands = Array.isArray(rule.bands) ? rule.bands : []
                  return (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div><Label>Target</Label><Input type="number" value={criterion.target ?? ''} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { target: event.target.value === '' ? undefined : Number(event.target.value) })} /></div>
                        <div><Label>Unit</Label><Input value={criterion.unit ?? ''} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { unit: event.target.value })} /></div>
                        <div><Label>Period label</Label><Input value={criterion.periodLabel ?? ''} placeholder="e.g. per month" disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { periodLabel: event.target.value })} /></div>
                        <div><Label>Aggregation</Label><NativeSelect value={criterion.krAggregation ?? 'AVG'} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { krAggregation: event.target.value })}><option>AVG</option><option>SUM</option><option>LATEST</option></NativeSelect></div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
                        <div>
                          <Label>Scoring rule</Label>
                          <NativeSelect
                            value={ruleType}
                            disabled={!editable}
                            onChange={(event) => updateCriterion(tierIndex, criterionIndex, { scoringRuleJson: DEFAULT_RULES[event.target.value] ?? DEFAULT_RULES.LINEAR_CAPPED })}
                          >
                            <option value="LINEAR_CAPPED">Linear capped</option>
                            <option value="INVERSE_BANDS">Inverse bands</option>
                            <option value="MANUAL">Manual</option>
                          </NativeSelect>
                        </div>
                        {ruleType === 'LINEAR_CAPPED' && (
                          <div>
                            <Label>Max score</Label>
                            <Input type="number" value={rule.maxScore ?? 10} disabled={!editable} onChange={(event) => updateMetricRule(tierIndex, criterionIndex, rule, { maxScore: Number(event.target.value) })} />
                            <p className="mt-1 text-xs text-muted-foreground">Scores actual ÷ target × max score, capped. Requires a positive target.</p>
                          </div>
                        )}
                        {ruleType === 'MANUAL' && (
                          <p className="self-end text-xs text-muted-foreground">Evaluators enter the score manually — no automatic computation.</p>
                        )}
                      </div>
                      {ruleType === 'INVERSE_BANDS' && (
                        <div className="space-y-2">
                          <Label>Bands (actual ≤ threshold → score; leave threshold empty for “otherwise”)</Label>
                          {bands.map((band, bandIndex) => (
                            <div key={bandIndex} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">actual ≤</span>
                              <Input
                                type="number"
                                className="w-28"
                                value={band.maxActual ?? ''}
                                placeholder="otherwise"
                                disabled={!editable}
                                onChange={(event) => updateMetricRule(tierIndex, criterionIndex, rule, {
                                  bands: bands.map((current, index) => index === bandIndex
                                    ? { ...current, maxActual: event.target.value === '' ? null : Number(event.target.value) }
                                    : current),
                                })}
                              />
                              <span className="text-xs text-muted-foreground">→ score</span>
                              <Input
                                type="number"
                                className="w-24"
                                value={band.score}
                                disabled={!editable}
                                onChange={(event) => updateMetricRule(tierIndex, criterionIndex, rule, {
                                  bands: bands.map((current, index) => index === bandIndex
                                    ? { ...current, score: Number(event.target.value) }
                                    : current),
                                })}
                              />
                              {editable && (
                                <Button variant="outline" size="sm" aria-label="Remove band" onClick={() => updateMetricRule(tierIndex, criterionIndex, rule, { bands: bands.filter((_, index) => index !== bandIndex) })}>
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          {editable && (
                            <Button variant="outline" size="sm" onClick={() => updateMetricRule(tierIndex, criterionIndex, rule, { bands: [...bands, { maxActual: 0, score: 0 }] })}>
                              <Plus className="mr-2 size-4" /> Add band
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => updateTier(tierIndex, { criteria: [...tier.criteria, newRubric()] })}><Plus className="mr-2 size-4" /> Add criterion</Button>
                {canInsertCulture && tier.id && <Button variant="outline" disabled={culture.isPending} onClick={() => culture.mutate(tier.id!)}><Library className="mr-2 size-4" /> Insert culture block</Button>}
              </div>
            )}
          </div>
        </section>
      ))}
      {editable && <Button variant="outline" onClick={() => setTiers((current) => [...current, { name: `Tier ${current.length + 1}`, maxPoints: 10, criteria: [newRubric()] }])}><Plus className="mr-2 size-4" /> Add tier</Button>}
      <TemplateScoringSettings
        templateId={templateId}
        editable={editable}
        tiers={tiers.map((tier) => ({ name: tier.name, maxPoints: tier.maxPoints }))}
        gatekeeperJson={query.data.gatekeeperJson}
        bandsJson={query.data.bandsJson}
      />
      {canMapMetrics && <MetricMappingManager templateId={templateId} tiers={query.data.tiers} />}
    </div>
  )
}
