'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Banknote, CheckCircle2, FileText, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import type { ActivityNode, PaymentMilestoneNode, ProjectDetail } from '../../hooks/useProject'
import {
  useAddPaymentMilestone,
  useDeletePaymentMilestone,
  usePaymentMilestones,
  useUpdatePaymentMilestone,
} from '../../hooks/useProject'

const STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-surface-muted text-ink-secondary',
  READY_TO_INVOICE: 'bg-primary-50 text-primary-700',
  INVOICED: 'bg-warning-50 text-warning-700',
  OVERDUE: 'bg-danger-50 text-danger-700',
  PAID: 'bg-success-50 text-success-700',
}

export function PaymentMilestonesRegister({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const { data, isLoading } = usePaymentMilestones(project.id)
  const add = useAddPaymentMilestone(project.id)
  const update = useUpdatePaymentMilestone(project.id)
  const remove = useDeletePaymentMilestone(project.id)
  const activities = useMemo(() => flattenActivities(project), [project])
  const [draft, setDraft] = useState(initialDraft(project.currency))

  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  const rows = data?.rows ?? []
  const submit = async () => {
    if (!draft.name.trim()) return
    await add.mutateAsync({
      name: draft.name,
      contractClause: draft.contractClause.trim() || null,
      triggerActivityId: draft.triggerActivityId || null,
      amount: Number(draft.amount),
      currency: draft.currency,
      plannedInvoiceDate: draft.plannedInvoiceDate ? toIsoDate(draft.plannedInvoiceDate) : null,
    })
    setDraft(initialDraft(project.currency))
  }

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {(data?.readyToInvoiceCount ?? 0) > 0 && (
          <span className="rounded-pill bg-primary-50 px-2.5 py-1 text-body-sm font-medium text-primary-700">
            <FileText className="mr-1 inline size-3.5" /> {data?.readyToInvoiceCount} ready to invoice
          </span>
        )}
        {(data?.overdueCount ?? 0) > 0 && (
          <span className="rounded-pill bg-danger-50 px-2.5 py-1 text-body-sm font-medium text-danger-700">
            <AlertTriangle className="mr-1 inline size-3.5" /> CEO dashboard: {data?.overdueCount} overdue
          </span>
        )}
        <span className="rounded-pill bg-surface-muted px-2.5 py-1 text-body-sm text-ink-secondary">
          Outstanding {formatMoney(data?.outstandingAmount ?? 0, project.currency)}
        </span>
      </div>

      {canEdit && (
        <div className="mb-4 rounded-card border border-black/[0.08] p-3">
          <div className="mb-2 text-body-sm font-medium text-ink-primary">New Payment Milestone</div>
          <div className="grid gap-2 lg:grid-cols-5">
            <input className="input lg:col-span-2" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Milestone name" />
            <input className="input" type="number" min={0} value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="Amount" />
            <input className="input" value={draft.currency} maxLength={3} onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase() }))} placeholder="ETB" />
            <input className="input" type="date" value={draft.plannedInvoiceDate} onChange={(e) => setDraft((d) => ({ ...d, plannedInvoiceDate: e.target.value }))} />
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            <select className="input lg:col-span-2" value={draft.triggerActivityId} onChange={(e) => setDraft((d) => ({ ...d, triggerActivityId: e.target.value }))}>
              <option value="">No activity trigger</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>{activity.path}</option>
              ))}
            </select>
            <input className="input" value={draft.contractClause} onChange={(e) => setDraft((d) => ({ ...d, contractClause: e.target.value }))} placeholder="Contract clause" />
          </div>
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={!draft.name.trim() || add.isPending} onClick={() => void submit()}>
              <Plus className="mr-1 size-3.5" /> Add Milestone
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Banknote} title="No payment milestones recorded" description="Link a milestone to an approved deliverable to notify finance." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
                <th className="px-2 py-1.5 font-medium">Milestone</th>
                <th className="px-2 py-1.5 font-medium">Trigger</th>
                <th className="px-2 py-1.5 font-medium">Amount</th>
                <th className="px-2 py-1.5 font-medium">Invoice</th>
                <th className="px-2 py-1.5 font-medium">Outstanding</th>
                {canEdit && <th className="px-2 py-1.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {rows.map((row) => (
                <PaymentRow
                  key={row.id}
                  row={row}
                  canEdit={canEdit}
                  triggerLabel={activities.find((a) => a.id === row.triggerActivityId)?.path}
                  onUpdate={(patch) => update.mutate({ paymentMilestoneId: row.id, ...patch })}
                  onDelete={() => remove.mutate({ paymentMilestoneId: row.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PaymentRow({ row, canEdit, triggerLabel, onUpdate, onDelete }: {
  row: PaymentMilestoneNode
  canEdit: boolean
  triggerLabel?: string
  onUpdate: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  return (
    <tr>
      <td className="max-w-sm px-2 py-2">
        <div className="font-medium text-ink-primary">{row.name}</div>
        {row.contractClause && <div className="text-[12px] text-ink-tertiary">{row.contractClause}</div>}
      </td>
      <td className="max-w-md px-2 py-2 text-ink-secondary">{triggerLabel ?? 'Manual'}</td>
      <td className="px-2 py-2 text-ink-secondary">{formatMoney(row.amount, row.currency)}</td>
      <td className="px-2 py-2">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-medium', STATUS_CLASS[row.invoiceStatus])}>
          {labelize(row.invoiceStatus)}
        </span>
        <div className="mt-1 text-[12px] text-ink-tertiary">Planned {fmtDate(row.plannedInvoiceDate)}</div>
      </td>
      <td className="px-2 py-2">
        {row.isOverdue ? (
          <span className="font-medium text-danger-700">{row.daysOutstanding} days</span>
        ) : row.daysOutstanding != null ? (
          <span className="text-ink-secondary">{row.daysOutstanding} days</span>
        ) : (
          <span className="text-ink-tertiary">-</span>
        )}
        {row.actualInvoiceDate && <div className="mt-1 text-[12px] text-ink-tertiary">Invoiced {fmtDate(row.actualInvoiceDate)}</div>}
      </td>
      {canEdit && (
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            {(row.invoiceStatus === 'READY_TO_INVOICE' || row.invoiceStatus === 'PENDING') && (
              <button className="btn btn-outline btn-sm" onClick={() => onUpdate({ invoiceStatus: 'INVOICED', actualInvoiceDate: new Date().toISOString() })}>Invoiced</button>
            )}
            {row.invoiceStatus !== 'PAID' && (
              <button className="rounded p-1 text-success-700 hover:bg-success-50" onClick={() => onUpdate({ invoiceStatus: 'PAID', paymentStatus: 'PAID' })} title="Mark paid">
                <CheckCircle2 className="size-3.5" />
              </button>
            )}
            <button className="rounded p-1 text-danger-600 hover:bg-danger-50" onClick={onDelete} title="Delete">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

function flattenActivities(project: ProjectDetail): { id: string; path: string; activity: ActivityNode }[] {
  return project.phases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) =>
      milestone.activities.map((activity) => ({ id: activity.id, path: `${phase.name} / ${milestone.name} / ${activity.title}`, activity }))
    )
  )
}

function initialDraft(currency: string) {
  return {
    name: '',
    contractClause: '',
    triggerActivityId: '',
    amount: '0',
    currency,
    plannedInvoiceDate: '',
  }
}

function toIsoDate(date: string): string {
  return new Date(`${date}T12:00:00.000Z`).toISOString()
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '-'
  }
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString()}`
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}
