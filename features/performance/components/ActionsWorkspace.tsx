'use client'

import { useState } from 'react'
import { Award } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input } from '@/components/ui'
import { useDevelopmentActions, useTransitionDevelopmentAction } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

export function ActionsWorkspace() {
  const query = useDevelopmentActions()
  const transition = useTransitionDevelopmentAction()
  const permissions = usePerformancePermissions()
  const canApprove = permissions.can('button.performance.action.approve', 'development_action', 'canWrite')
  const canReject = permissions.can('button.performance.action.reject', 'development_action', 'canWrite')
  const canExecute = permissions.can('button.performance.action.execute', 'development_action', 'canWrite')
  const [reasons, setReasons] = useState<Record<string, string>>({})
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Reward and development recommendations</CardTitle></CardHeader>
      <CardContent>
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading recommendations...</p> : (query.data ?? []).length === 0 ? (
          <EmptyState icon={Award} title="No recommendations" description="System recommendations appear after evaluations are finalized." />
        ) : (
          <div className="divide-y divide-border">
            {(query.data ?? []).map((action) => (
              <div key={action.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-sm font-semibold">{action.evaluation.employee.name} · {action.type.replace(/_/g, ' ')}</p><p className="text-xs text-muted-foreground">{action.evaluation.cycle.name} · {action.evaluation.decisionBand ?? 'No band'}</p></div>
                  <PerformanceStatusBadge status={action.status} />
                </div>
                {((action.status === 'RECOMMENDED' && (canApprove || canReject)) || (action.status === 'APPROVED' && canExecute)) && (
                  <div className="flex flex-wrap gap-2">
                    <Input className="min-w-64 flex-1" value={reasons[action.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [action.id]: event.target.value }))} placeholder="Decision or execution note" />
                    {action.status === 'RECOMMENDED' && <>
                      {canApprove && <Button size="sm" onClick={() => transition.mutate({ id: action.id, status: 'APPROVED', reason: reasons[action.id] ?? '' })}>Approve</Button>}
                      {canReject && <Button size="sm" variant="outline" onClick={() => transition.mutate({ id: action.id, status: 'REJECTED', reason: reasons[action.id] ?? '' })}>Reject</Button>}
                    </>}
                    {canExecute && action.status === 'APPROVED' && <Button size="sm" onClick={() => transition.mutate({ id: action.id, status: 'EXECUTED', reason: reasons[action.id] ?? 'Executed' })}>Mark executed</Button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
