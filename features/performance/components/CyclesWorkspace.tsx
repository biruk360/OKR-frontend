'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { CalendarRange, Play, Plus } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label, Modal } from '@/components/ui'
import { useCreateReviewCycle, useOpenReviewCycle, useReviewCycles } from '../hooks/queries'
import { PerformanceStatusBadge } from './PerformanceStatusBadge'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type CycleForm = { name: string; cadence: string; periodStart: string; periodEnd: string }

export function CyclesWorkspace() {
  const cycles = useReviewCycles()
  const create = useCreateReviewCycle()
  const openCycle = useOpenReviewCycle()
  const permissions = usePerformancePermissions()
  const canCreate = permissions.can('button.performance.cycle.create', 'review_cycle', 'canCreate')
  const canOpen = permissions.can('button.performance.cycle.open', 'review_cycle', 'canSubmit')
    && permissions.canDo('evaluation', 'canCreate')
    && permissions.canDo('evaluator_assignment', 'canCreate')
    && permissions.canDo('review_cycle_issue', 'canCreate')
    && permissions.canDo('evaluation_metric_source', 'canCreate')
  const [modalOpen, setModalOpen] = useState(false)
  const { register, handleSubmit, reset } = useForm<CycleForm>({ defaultValues: { cadence: 'MONTHLY' } })
  const submit = handleSubmit(async (values) => {
    await create.mutateAsync({ ...values, allCompany: true })
    reset({ name: '', cadence: 'MONTHLY', periodStart: '', periodEnd: '' })
    setModalOpen(false)
  })

  return (
    <>
      {canCreate && <div className="mb-4 flex justify-end"><Button onClick={() => setModalOpen(true)}><Plus className="mr-2 size-4" /> New cycle</Button></div>}
      <Card>
        <CardHeader><CardTitle className="text-base">Review cycles</CardTitle></CardHeader>
        <CardContent>
          {cycles.isLoading ? <p className="text-sm text-muted-foreground">Loading cycles...</p> : (cycles.data ?? []).length === 0 ? (
            <EmptyState icon={CalendarRange} title="No review cycles" description="Create a review cycle after publishing scorecard templates." />
          ) : (
            <div className="divide-y divide-border">
              {(cycles.data ?? []).map((cycle) => (
                <div key={cycle.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <div className="flex items-center gap-2"><p className="text-sm font-semibold">{cycle.name}</p><PerformanceStatusBadge status={cycle.status} /></div>
                    <p className="mt-1 text-xs text-muted-foreground">{cycle.cadence.replace(/_/g, ' ')} · {cycle._count.evaluations} evaluations · {cycle._count.issues} issues</p>
                  </div>
                  {canOpen && cycle.status === 'PLANNED' && <Button size="sm" variant="outline" onClick={() => openCycle.mutate(cycle.id)} disabled={openCycle.isPending}><Play className="mr-1 size-3.5" /> Open cycle</Button>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create review cycle" footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>Create cycle</Button></>}>
        <form onSubmit={submit} className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Cycle name</Label><Input {...register('name', { required: true })} placeholder="June 2026" /></div>
          <div><Label>Cadence</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" {...register('cadence')}><option value="MONTHLY">Monthly</option><option value="EVERY_TWO_MONTHS">Every two months</option><option value="QUARTERLY">Quarterly</option></select></div>
          <div />
          <div><Label>Period start</Label><Input type="date" {...register('periodStart', { required: true })} /></div>
          <div><Label>Period end</Label><Input type="date" {...register('periodEnd', { required: true })} /></div>
        </form>
      </Modal>
    </>
  )
}
