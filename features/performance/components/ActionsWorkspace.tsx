'use client'

import { useState } from 'react'
import { Award, CheckCircle2, PlayCircle, XCircle } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Label, Textarea } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDevelopmentActions, useTransitionDevelopmentAction } from '../hooks/queries'
import { humanizeEnum, PerformanceStatusBadge } from './PerformanceStatusBadge'
import { SectionCard } from './SectionCard'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type PendingTransition = {
  id: string
  employeeName: string | null
  next: 'APPROVED' | 'REJECTED' | 'EXECUTED'
}

const TRANSITION_COPY: Record<PendingTransition['next'], { title: string; confirmLabel: string; variant: 'danger' | 'info'; icon: typeof CheckCircle2 }> = {
  APPROVED: { title: 'Approve recommendation', confirmLabel: 'Approve', variant: 'info', icon: CheckCircle2 },
  REJECTED: { title: 'Reject recommendation', confirmLabel: 'Reject', variant: 'danger', icon: XCircle },
  EXECUTED: { title: 'Mark recommendation executed', confirmLabel: 'Mark executed', variant: 'info', icon: PlayCircle },
}

export function ActionsWorkspace() {
  const query = useDevelopmentActions()
  const transition = useTransitionDevelopmentAction()
  const permissions = usePerformancePermissions()
  const canApprove = permissions.can('button.performance.action.approve', 'development_action', 'canWrite')
  const canReject = permissions.can('button.performance.action.reject', 'development_action', 'canWrite')
  const canExecute = permissions.can('button.performance.action.execute', 'development_action', 'canWrite')
  const [pending, setPending] = useState<PendingTransition | null>(null)
  const [reason, setReason] = useState('')

  function openConfirm(action: { id: string; evaluation: { employee: { name: string | null } } }, next: PendingTransition['next']) {
    setReason('')
    setPending({ id: action.id, employeeName: action.evaluation.employee.name, next })
  }

  async function confirmTransition() {
    if (!pending) return
    await transition.mutateAsync({
      id: pending.id,
      status: pending.next,
      reason: pending.next === 'EXECUTED' ? (reason || 'Executed') : reason,
    })
    setPending(null)
    setReason('')
  }

  const copy = pending ? TRANSITION_COPY[pending.next] : null

  return (
    <>
      <SectionCard title="Reward and development recommendations">
        {query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 py-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState bare icon={Award} title="No recommendations" description="System recommendations appear after evaluations are finalized." />
        ) : (
          <div className="divide-y divide-border">
            {(query.data ?? []).map((action) => (
              <div key={action.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-sm font-semibold">{action.evaluation.employee.name} · {humanizeEnum(action.type)}</p><p className="text-xs text-muted-foreground">{action.evaluation.cycle.name} · {action.evaluation.decisionBand ?? 'No band'}</p></div>
                  <PerformanceStatusBadge status={action.status} />
                </div>
                {((action.status === 'RECOMMENDED' && (canApprove || canReject)) || (action.status === 'APPROVED' && canExecute)) && (
                  <div className="flex flex-wrap gap-2">
                    {action.status === 'RECOMMENDED' && <>
                      {canApprove && <Button size="sm" onClick={() => openConfirm(action, 'APPROVED')}>Approve</Button>}
                      {canReject && <Button size="sm" variant="outline" onClick={() => openConfirm(action, 'REJECTED')}>Reject</Button>}
                    </>}
                    {canExecute && action.status === 'APPROVED' && <Button size="sm" onClick={() => openConfirm(action, 'EXECUTED')}>Mark executed</Button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <ConfirmDialog
        open={!!pending}
        onClose={() => { setPending(null); setReason('') }}
        onConfirm={confirmTransition}
        title={copy?.title ?? ''}
        message={pending ? `${copy?.confirmLabel} the recommendation for ${pending.employeeName ?? 'this employee'}?` : ''}
        variant={copy?.variant ?? 'info'}
        icon={copy?.icon}
        confirmLabel={copy?.confirmLabel}
        isLoading={transition.isPending}
        extraContent={
          <div>
            <Label>Decision or execution note</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional note recorded with this decision"
            />
          </div>
        }
      />
    </>
  )
}
