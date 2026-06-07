'use client'

import Link from 'next/link'
import { BarChart3, LockKeyhole, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard, StatGrid } from '@/components/ui'
import { useMyPerformance, useUpdateWeeklyStep } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

export function PerformanceHome() {
  const query = useMyPerformance()
  const updateStep = useUpdateWeeklyStep()
  const permissions = usePerformancePermissions()
  const canUpdateFocus = permissions.can('page.performance.my', 'improvement_focus', 'canWrite')
  const rows = query.data?.evaluations ?? []
  const finalized = rows.filter((evaluation) => evaluation.status === 'FINALIZED')
  const active = rows.filter((evaluation) => !['FINALIZED', 'EXCUSED'].includes(evaluation.status))

  return (
    <div className="space-y-6">
      <StatGrid columns={3}>
        <StatCard label="Active reviews" value={active.length} icon={LockKeyhole} tone="blue" />
        <StatCard label="Finalized reviews" value={finalized.length} icon={BarChart3} tone="green" />
        <StatCard label="Current focus areas" value={query.data?.focuses.length ?? 0} icon={Target} tone="purple" />
      </StatGrid>
      {(query.data?.focuses ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Active growth focuses</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(query.data?.focuses ?? []).map((focus) => (
              <div key={focus.id} className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold">{focus.criterion.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{focus.targetText}</p>
                {canUpdateFocus && <form className="mt-3 flex gap-2" onSubmit={(event) => {
                  event.preventDefault()
                  const input = new FormData(event.currentTarget).get('weeklyStep')
                  if (typeof input === 'string' && input.trim()) updateStep.mutate({ id: focus.id, weeklyStep: input.trim() })
                }}>
                  <input name="weeklyStep" defaultValue={focus.weeklyStep ?? ''} placeholder="Commit a weekly step" className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
                  <button className="rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" disabled={updateStep.isPending}>Save</button>
                </form>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Your performance history</CardTitle></CardHeader>
        <CardContent>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading performance reviews...</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={BarChart3} title="No performance reviews yet" description="Your reviews and growth focuses will appear here." />
          ) : (
            <div className="divide-y divide-border">
              {rows.map((evaluation) => (
                <Link key={evaluation.id} href={`/dashboard/performance/evaluations/${evaluation.id}/score`} className="flex items-center justify-between gap-4 py-3 hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{evaluation.cycle.name}</p>
                    <p className="text-xs text-muted-foreground">{evaluation.templateName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {evaluation.normalized != null && <span className="text-sm font-semibold">{evaluation.normalized.toFixed(1)}</span>}
                    <PerformanceStatusBadge status={evaluation.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
