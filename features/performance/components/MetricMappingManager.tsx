'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label } from '@/components/ui'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useMetricKeyResults, useMetricMappings, useSaveMetricMappings } from '../hooks/queries'
import type { PerformanceTier } from '../types'

export function MetricMappingManager({ templateId, tiers }: { templateId: string; tiers: PerformanceTier[] }) {
  const metrics = useMemo(() => tiers.flatMap((tier) => tier.criteria).filter((criterion) => criterion.type === 'METRIC'), [tiers])
  const mappings = useMetricMappings(templateId)
  const save = useSaveMetricMappings(templateId)
  const { users } = useUsersForSelection()
  const [criterionId, setCriterionId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const keyResults = useMetricKeyResults(employeeId)

  useEffect(() => {
    const linked = (mappings.data ?? [])
      .filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId)
      .sort((a, b) => a.position - b.position)
      .map((mapping) => mapping.keyResultId)
    setSelected(linked)
  }, [criterionId, employeeId, mappings.data])

  const candidates = (keyResults.data ?? []).filter((keyResult) => keyResult.title.toLowerCase().includes(search.trim().toLowerCase()))
  const currentMappings = (mappings.data ?? []).filter((mapping) => mapping.criterionId === criterionId && mapping.employeeId === employeeId)

  if (metrics.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Link2 className="size-4" /> Employee metric sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Link reusable metric criteria to the selected employee&apos;s active Key Results. Links are frozen into an evaluation when its cycle opens.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Metric criterion</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={criterionId} onChange={(event) => setCriterionId(event.target.value)}>
              <option value="">Select metric</option>
              {metrics.map((criterion) => <option key={criterion.id} value={criterion.id}>{criterion.title}</option>)}
            </select>
          </div>
          <div>
            <Label>Employee</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Select employee</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
            </select>
          </div>
        </div>
        {criterionId && employeeId && (
          <>
            <div>
              <Label>Search employee Key Results</Label>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search active Key Results" />
            </div>
            {keyResults.isLoading ? <p className="text-sm text-muted-foreground">Loading Key Results...</p> : candidates.length === 0 ? (
              <EmptyState bare title="No active Key Results" description="This employee needs an active Key Result before an automatic metric can be mapped." />
            ) : (
              <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {candidates.map((keyResult) => (
                  <label key={keyResult.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(keyResult.id)}
                      onChange={(event) => setSelected((current) => event.target.checked
                        ? [...current, keyResult.id]
                        : current.filter((id) => id !== keyResult.id))}
                    />
                    <span className="flex-1">{keyResult.title}</span>
                    <span className="text-xs text-muted-foreground">{keyResult.currentValue} / {keyResult.targetValue} {keyResult.unit}</span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{currentMappings.length} currently linked · {selected.length} selected</p>
              <Button disabled={save.isPending} onClick={() => save.mutate({ criterionId, employeeId, keyResultIds: selected })}>
                Save metric sources
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
