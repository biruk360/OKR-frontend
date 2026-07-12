'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Building2, CalendarRange, ListChecks, Lock, Play, Plus } from 'lucide-react'
import { Button, Checkbox, ConfirmDialog, EmptyState, Input, Label, Modal, Textarea } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDepartments } from '@/hooks/useDepartments'
import { getErrorDetailIds, useCloseReviewCycle, useCreateReviewCycle, useOpenReviewCycle, useReviewCycles } from '../hooks/queries'
import { humanizeEnum, PerformanceStatusBadge } from './PerformanceStatusBadge'
import { CycleIssuesModal } from './CycleIssuesModal'
import { NativeSelect } from './NativeSelect'
import { SectionCard } from './SectionCard'
import { usePerformancePermissions } from '../hooks/usePerformancePermissions'

type CycleScope = 'ALL' | 'DEPARTMENTS'
type CycleForm = { name: string; cadence: string; periodStart: string; periodEnd: string; scope: CycleScope; departmentIds: string[] }

export function CyclesWorkspace() {
  const cycles = useReviewCycles()
  const create = useCreateReviewCycle()
  const openCycle = useOpenReviewCycle()
  const closeCycle = useCloseReviewCycle()
  const permissions = usePerformancePermissions()
  const canCreate = permissions.can('button.performance.cycle.create', 'review_cycle', 'canCreate')
  const canOpen = permissions.can('button.performance.cycle.open', 'review_cycle', 'canSubmit')
    && permissions.canDo('evaluation', 'canCreate')
    && permissions.canDo('evaluator_assignment', 'canCreate')
    && permissions.canDo('review_cycle_issue', 'canCreate')
    && permissions.canDo('evaluation_metric_source', 'canCreate')
  const canClose = permissions.can('button.performance.cycle.close', 'review_cycle', 'canSubmit')
  const [modalOpen, setModalOpen] = useState(false)
  const [issuesCycleId, setIssuesCycleId] = useState<string | null>(null)
  const [closeOverride, setCloseOverride] = useState<{ cycleId: string; incompleteCount: number } | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CycleForm>({
    defaultValues: { cadence: 'MONTHLY', scope: 'ALL', departmentIds: [] },
  })
  const scope = watch('scope')
  const selectedDepartmentIds = watch('departmentIds') ?? []
  const { departments, isLoading: departmentsLoading } = useDepartments({ enabled: modalOpen && scope === 'DEPARTMENTS' })
  // Registered without an input so the checkbox list participates in RHF validation.
  register('departmentIds', {
    validate: (value, values) => values.scope === 'ALL' || (value?.length ?? 0) > 0 || 'Select at least one department',
  })
  function toggleDepartment(departmentId: string, checked: boolean) {
    const next = checked
      ? [...selectedDepartmentIds, departmentId]
      : selectedDepartmentIds.filter((id) => id !== departmentId)
    setValue('departmentIds', next, { shouldValidate: true })
  }
  const submit = handleSubmit(async (values) => {
    // POST /api/performance/cycles accepts { allCompany, departmentIds } — scoped
    // cycles require allCompany: false plus at least one department id.
    const body = {
      name: values.name,
      cadence: values.cadence,
      periodStart: values.periodStart,
      periodEnd: values.periodEnd,
      allCompany: values.scope === 'ALL',
      departmentIds: values.scope === 'ALL' ? undefined : values.departmentIds,
    }
    await create.mutateAsync(body)
    reset({ name: '', cadence: 'MONTHLY', periodStart: '', periodEnd: '', scope: 'ALL', departmentIds: [] })
    setModalOpen(false)
  })

  async function attemptClose(cycleId: string) {
    try {
      await closeCycle.mutateAsync({ id: cycleId })
    } catch (error) {
      const incompleteIds = getErrorDetailIds(error, 'evaluationIds')
      if (incompleteIds) {
        setOverrideReason('')
        setCloseOverride({ cycleId, incompleteCount: incompleteIds.length })
      }
    }
  }

  async function confirmCloseOverride() {
    if (!closeOverride || !overrideReason.trim()) return
    await closeCycle.mutateAsync({ id: closeOverride.cycleId, overrideReason: overrideReason.trim() })
    setCloseOverride(null)
    setOverrideReason('')
  }

  return (
    <>
      <SectionCard
        title="Review cycles"
        actions={canCreate && (
          <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="mr-1 size-3.5" /> New cycle</Button>
        )}
      >
        {cycles.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 py-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : (cycles.data ?? []).length === 0 ? (
          <EmptyState
            bare
            icon={CalendarRange}
            title="No review cycles"
            description="Create a review cycle after publishing scorecard templates."
            action={canCreate ? { label: 'New cycle', onClick: () => setModalOpen(true) } : undefined}
          />
        ) : (
          <div className="divide-y divide-border">
            {(cycles.data ?? []).map((cycle) => (
              <div key={cycle.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div>
                  <div className="flex items-center gap-2"><p className="text-sm font-semibold">{cycle.name}</p><PerformanceStatusBadge status={cycle.status} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{humanizeEnum(cycle.cadence)} · <span className="tabular-nums">{cycle._count.evaluations}</span> evaluations · <span className="tabular-nums">{cycle._count.issues}</span> issues</p>
                  {!cycle.allCompany && cycle.departments.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="size-3" />
                      {cycle.departments.map((entry) => entry.department.name).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {cycle._count.issues > 0 && <Button size="sm" variant="outline" onClick={() => setIssuesCycleId(cycle.id)}><ListChecks className="mr-1 size-3.5" /> View issues</Button>}
                  {canOpen && cycle.status === 'PLANNED' && <Button size="sm" variant="outline" onClick={() => openCycle.mutate(cycle.id)} disabled={openCycle.isPending}><Play className="mr-1 size-3.5" /> Open cycle</Button>}
                  {canClose && ['OPEN', 'CONSOLIDATING'].includes(cycle.status) && (
                    <Button size="sm" variant="outline" onClick={() => attemptClose(cycle.id)} disabled={closeCycle.isPending}><Lock className="mr-1 size-3.5" /> Close cycle</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create review cycle" footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={submit} disabled={create.isPending}>Create cycle</Button></>}>
        <form onSubmit={submit} className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Cycle name</Label>
            <Input {...register('name', { required: 'Cycle name is required' })} placeholder="June 2026" />
            {errors.name && <p className="mt-1 text-xs text-danger-600">{errors.name.message}</p>}
          </div>
          <div>
            <Label>Cadence</Label>
            <NativeSelect {...register('cadence')}>
              <option value="MONTHLY">Monthly</option>
              <option value="EVERY_TWO_MONTHS">Every two months</option>
              <option value="QUARTERLY">Quarterly</option>
            </NativeSelect>
          </div>
          <div />
          <div>
            <Label>Period start</Label>
            <Input type="date" {...register('periodStart', { required: 'Period start is required' })} />
            {errors.periodStart && <p className="mt-1 text-xs text-danger-600">{errors.periodStart.message}</p>}
          </div>
          <div>
            <Label>Period end</Label>
            <Input type="date" {...register('periodEnd', { required: 'Period end is required' })} />
            {errors.periodEnd && <p className="mt-1 text-xs text-danger-600">{errors.periodEnd.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <Label>Scope</Label>
            <NativeSelect {...register('scope')}>
              <option value="ALL">All company</option>
              <option value="DEPARTMENTS">Specific departments</option>
            </NativeSelect>
          </div>
          {scope === 'DEPARTMENTS' && (
            <div className="sm:col-span-2">
              <Label>Departments</Label>
              {departmentsLoading ? (
                <div className="mt-2 space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-4 w-1/2" />)}
                </div>
              ) : departments.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No departments found.</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {departments.map((department) => (
                    <Label key={department.id} className="flex items-center gap-2 text-sm font-normal">
                      <Checkbox
                        checked={selectedDepartmentIds.includes(department.id)}
                        onCheckedChange={(checked) => toggleDepartment(department.id, checked === true)}
                      />
                      {department.name}
                    </Label>
                  ))}
                </div>
              )}
              {errors.departmentIds && <p className="mt-1 text-xs text-danger-600">{errors.departmentIds.message}</p>}
            </div>
          )}
        </form>
      </Modal>
      {issuesCycleId && <CycleIssuesModal cycleId={issuesCycleId} open onClose={() => setIssuesCycleId(null)} />}
      <ConfirmDialog
        open={!!closeOverride}
        onClose={() => { setCloseOverride(null); setOverrideReason('') }}
        onConfirm={confirmCloseOverride}
        title="Close cycle with incomplete evaluations"
        message={(closeOverride?.incompleteCount ?? 0) === 1 ? '1 evaluation is not finalized.' : `${closeOverride?.incompleteCount ?? 0} evaluations are not finalized.`}
        description="Closing now locks the cycle. Provide an override reason to close anyway."
        variant="warning"
        icon={Lock}
        confirmLabel="Close anyway"
        isLoading={closeCycle.isPending}
        disabled={!overrideReason.trim()}
        extraContent={
          <div>
            <Label>Override reason</Label>
            <Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Why is this cycle being closed with incomplete evaluations?" />
          </div>
        }
      />
    </>
  )
}
