'use client'

import { CheckCircle2, ListChecks, XCircle } from 'lucide-react'
import { Button, EmptyState, Modal } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { CycleIssueType, ReviewCycleIssue } from '../types'
import { useReviewCycle, useUpdateCycleIssue } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

const ISSUE_TYPE_LABELS: Record<CycleIssueType, string> = {
  NO_TEMPLATE: 'No template',
  NO_LEAD: 'No lead evaluator',
  AMBIGUOUS_LEAD: 'Ambiguous lead',
  METRIC_SOURCE_MISSING: 'Metric source missing',
  ACTUAL_UNAVAILABLE: 'Actual unavailable',
}

function issueDetailText(issue: ReviewCycleIssue): string | null {
  if (!issue.detailJson || typeof issue.detailJson !== 'object') return null
  const entries = Object.entries(issue.detailJson).filter(([, value]) => value !== null && value !== undefined)
  if (entries.length === 0) return null
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')
}

export function CycleIssuesModal({ cycleId, open, onClose }: { cycleId: string; open: boolean; onClose: () => void }) {
  const cycle = useReviewCycle(cycleId, open)
  const updateIssue = useUpdateCycleIssue(cycleId)
  const permissions = usePerformancePermissions()
  const canResolve = permissions.can('page.performance.cycles', 'review_cycle_issue', 'canWrite')
  const employeeById = new Map(
    (cycle.data?.evaluations ?? []).map((evaluation) => [evaluation.employee.id, evaluation.employee]),
  )

  return (
    <Modal open={open} onClose={onClose} title="Cycle issues" icon={ListChecks} size="lg" footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {cycle.isLoading ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : (cycle.data?.issues ?? []).length === 0 ? (
        <EmptyState bare icon={ListChecks} title="No issues" description="This cycle has no recorded issues." />
      ) : (
        <div className="divide-y divide-border">
          {(cycle.data?.issues ?? []).map((issue) => {
            const employee = issue.employeeId ? employeeById.get(issue.employeeId) : null
            const detail = issueDetailText(issue)
            return (
              <div key={issue.id} className={cn('flex flex-wrap items-start justify-between gap-3 py-3', issue.status !== 'OPEN' && 'opacity-60')}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{ISSUE_TYPE_LABELS[issue.type] ?? issue.type}</p>
                    <PerformanceStatusBadge status={issue.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {employee ? `${employee.name ?? 'Unknown employee'}${employee.designation ? ` · ${employee.designation}` : ''}` : 'No employee'}
                  </p>
                  {detail && <p className="mt-1 break-all text-xs text-muted-foreground">{detail}</p>}
                </div>
                {canResolve && issue.status === 'OPEN' && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" disabled={updateIssue.isPending} onClick={() => updateIssue.mutate({ issueId: issue.id, status: 'RESOLVED' })}>
                      <CheckCircle2 className="mr-1 size-3.5" /> Resolve
                    </Button>
                    <Button size="sm" variant="outline" disabled={updateIssue.isPending} onClick={() => updateIssue.mutate({ issueId: issue.id, status: 'WAIVED' })}>
                      <XCircle className="mr-1 size-3.5" /> Waive
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
