'use client'

import { useEffect, useState } from 'react'
import { Library, Plus, Save, Trash2 } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label, Textarea } from '@/components/ui'
import { useInsertCultureBlock, usePerformanceTemplate, useSaveTemplateBuilder } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { MetricMappingManager } from './MetricMappingManager'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type BuilderCriterion = {
  type: 'RUBRIC' | 'METRIC'
  code?: string
  title: string
  maxPoints: number
  anchorJson?: Record<string, string>
  target?: number
  unit?: string
  scoringRuleJson?: Record<string, unknown>
  krAggregation?: string
}
type BuilderTier = { id?: string; name: string; maxPoints: number; criteria: BuilderCriterion[] }

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
        scoringRuleJson: criterion.scoringRuleJson ?? undefined,
        krAggregation: criterion.krAggregation ?? undefined,
      })),
    })))
  }, [query.data])

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading template...</p>
  if (!query.data) return <EmptyState title="Template not found" />
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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{query.data.family.name}</h2>
              <PerformanceStatusBadge status={query.data.status} />
            </div>
            <p className="text-sm text-muted-foreground">Version {query.data.version} · {query.data.maxTotal} max points</p>
          </div>
          {editable && <Button onClick={() => save.mutate(tiers)} disabled={save.isPending}><Save className="mr-2 size-4" /> Save builder</Button>}
        </CardContent>
      </Card>

      {tiers.map((tier, tierIndex) => (
        <Card key={tierIndex}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_10rem]">
                <div><Label>Tier name</Label><Input value={tier.name} disabled={!editable} onChange={(event) => updateTier(tierIndex, { name: event.target.value })} /></div>
                <div><Label>Tier max points</Label><Input type="number" value={tier.maxPoints} disabled={!editable} onChange={(event) => updateTier(tierIndex, { maxPoints: Number(event.target.value) })} /></div>
              </div>
              {editable && <Button variant="outline" size="sm" onClick={() => setTiers((current) => current.filter((_, index) => index !== tierIndex))}><Trash2 className="size-4" /></Button>}
            </div>
            <p className="text-xs text-muted-foreground">
              Criterion total: {tier.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {tier.criteria.map((criterion, criterionIndex) => (
              <div key={criterionIndex} className="rounded-lg border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr_7rem_auto]">
                  <div>
                    <Label>Type</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                    </select>
                  </div>
                  <div><Label>Criterion title</Label><Input value={criterion.title} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { title: event.target.value })} /></div>
                  <div><Label>Max points</Label><Input type="number" value={criterion.maxPoints} disabled={!editable || criterion.type === 'RUBRIC'} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { maxPoints: Number(event.target.value) })} /></div>
                  {editable && <Button className="mt-6" variant="outline" size="sm" onClick={() => updateTier(tierIndex, { criteria: tier.criteria.filter((_, index) => index !== criterionIndex) })}><Trash2 className="size-4" /></Button>}
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
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div><Label>Target</Label><Input type="number" value={criterion.target ?? ''} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { target: Number(event.target.value) })} /></div>
                    <div><Label>Unit</Label><Input value={criterion.unit ?? ''} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { unit: event.target.value })} /></div>
                    <div><Label>Aggregation</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={criterion.krAggregation ?? 'AVG'} disabled={!editable} onChange={(event) => updateCriterion(tierIndex, criterionIndex, { krAggregation: event.target.value })}><option>AVG</option><option>SUM</option><option>LATEST</option></select></div>
                  </div>
                )}
              </div>
            ))}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => updateTier(tierIndex, { criteria: [...tier.criteria, newRubric()] })}><Plus className="mr-2 size-4" /> Add criterion</Button>
                {canInsertCulture && tier.id && <Button variant="outline" disabled={culture.isPending} onClick={() => culture.mutate(tier.id!)}><Library className="mr-2 size-4" /> Insert culture block</Button>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {editable && <Button variant="outline" onClick={() => setTiers((current) => [...current, { name: `Tier ${current.length + 1}`, maxPoints: 10, criteria: [newRubric()] }])}><Plus className="mr-2 size-4" /> Add tier</Button>}
      {canMapMetrics && <MetricMappingManager templateId={templateId} tiers={query.data.tiers} />}
    </div>
  )
}
