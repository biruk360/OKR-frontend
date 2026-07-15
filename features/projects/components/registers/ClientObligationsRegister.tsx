'use client'

import { useState } from 'react'
import { AlertTriangle, ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { CLIENT_OBLIGATION_TYPES } from '../../types'
import {
  useAddClientObligation,
  useClientObligations,
  useDeleteClientObligation,
  useUpdateClientObligation,
  type ClientObligationNode,
} from '../../hooks/useProject'

const TONE_CLASS: Record<string, string> = {
  GREEN: 'bg-success-50 text-success-700',
  AMBER: 'bg-warning-50 text-warning-700',
  RED: 'bg-danger-50 text-danger-700',
}

export function ClientObligationsRegister({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, isLoading } = useClientObligations(projectId)
  const add = useAddClientObligation(projectId)
  const update = useUpdateClientObligation(projectId)
  const remove = useDeleteClientObligation(projectId)
  const [draft, setDraft] = useState(initialDraft())

  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  const rows = data?.rows ?? []

  const submit = async () => {
    if (!draft.obligation.trim() || !draft.responsiblePerson.trim()) return
    await add.mutateAsync({
      ...draft,
      responsibleEmail: draft.responsibleEmail.trim() || null,
      slaBusinessDays: Number(draft.slaBusinessDays),
      notes: draft.notes.trim() || null,
    })
    setDraft(initialDraft())
  }

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className={cn('rounded-pill px-2.5 py-1 text-body-sm font-medium', TONE_CLASS[data?.clientHealthTone ?? 'GREEN'])}>
          Client Health {data?.clientHealthScore ?? 100}
        </span>
        {data?.ceoWarning && (
          <span className="rounded-pill bg-danger-50 px-2.5 py-1 text-body-sm font-medium text-danger-700">
            <AlertTriangle className="mr-1 inline size-3.5" /> CEO warning: compliance below 60%
          </span>
        )}
      </div>

      {canEdit && (
        <div className="mb-4 rounded-card border border-black/[0.08] p-3">
          <div className="mb-2 text-body-sm font-medium text-ink-primary">New Client Obligation</div>
          <div className="grid gap-2 lg:grid-cols-4">
            <input className="input" value={draft.obligation} onChange={(e) => setDraft((d) => ({ ...d, obligation: e.target.value }))} placeholder="Obligation" />
            <select className="input" value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}>
              {CLIENT_OBLIGATION_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
            </select>
            <input className="input" value={draft.responsiblePerson} onChange={(e) => setDraft((d) => ({ ...d, responsiblePerson: e.target.value }))} placeholder="Responsible person" />
            <input className="input" type="number" min={1} max={60} value={draft.slaBusinessDays} onChange={(e) => setDraft((d) => ({ ...d, slaBusinessDays: e.target.value }))} placeholder="SLA business days" />
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-3">
            <input className="input" value={draft.responsibleEmail} onChange={(e) => setDraft((d) => ({ ...d, responsibleEmail: e.target.value }))} placeholder="Email" />
            <input className="input" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes" />
            <label className="flex items-center gap-2 rounded-md border border-black/[0.08] px-2 text-body-sm">
              <input type="checkbox" checked={draft.isContractual} onChange={(e) => setDraft((d) => ({ ...d, isContractual: e.target.checked }))} />
              Contractual / include in R6
            </label>
          </div>
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={!draft.obligation.trim() || !draft.responsiblePerson.trim() || add.isPending} onClick={() => void submit()}>
              <Plus className="mr-1 size-3.5" /> Add Obligation
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No client obligations recorded" description="Approval SLAs here are used by the approval clock and compliance score." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
                <th className="px-2 py-1.5 font-medium">Obligation</th>
                <th className="px-2 py-1.5 font-medium">Responsible</th>
                <th className="px-2 py-1.5 font-medium">SLA</th>
                <th className="px-2 py-1.5 font-medium">Compliance</th>
                <th className="px-2 py-1.5 font-medium">R6</th>
                {canEdit && <th className="px-2 py-1.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {rows.map((row) => (
                <ObligationRow
                  key={row.id}
                  row={row}
                  canEdit={canEdit}
                  onUpdate={(patch) => update.mutate({ obligationId: row.id, ...patch })}
                  onDelete={() => remove.mutate({ obligationId: row.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ObligationRow({ row, canEdit, onUpdate, onDelete }: {
  row: ClientObligationNode
  canEdit: boolean
  onUpdate: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  return (
    <tr>
      <td className="max-w-sm px-2 py-2">
        <div className="font-medium text-ink-primary">{row.obligation}</div>
        <div className="text-[12px] text-ink-tertiary">{labelize(row.type)}{row.notes ? ` · ${row.notes}` : ''}</div>
      </td>
      <td className="px-2 py-2 text-ink-secondary">
        <div>{row.responsiblePerson}</div>
        {row.responsibleEmail && <div className="text-[12px] text-ink-tertiary">{row.responsibleEmail}</div>}
      </td>
      <td className="px-2 py-2 text-ink-secondary">{row.slaBusinessDays} business days</td>
      <td className="px-2 py-2">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-medium', TONE_CLASS[row.healthTone])}>
          {row.complianceRate == null ? 'No approvals yet' : `${row.complianceRate}%`}
        </span>
        <div className="mt-1 text-[12px] text-ink-tertiary">{row.breachCount} breaches</div>
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <button className={cn('rounded-md px-2 py-1 text-[12px] font-medium', row.isContractual ? 'bg-primary-50 text-primary-700' : 'bg-surface-muted text-ink-secondary')} onClick={() => onUpdate({ isContractual: !row.isContractual })}>
            {row.isContractual ? 'Included' : 'Internal'}
          </button>
        ) : row.isContractual ? 'Included' : 'Internal'}
      </td>
      {canEdit && (
        <td className="px-2 py-2">
          <button className="rounded p-1 text-danger-600 hover:bg-danger-50" onClick={onDelete} title="Delete">
            <Trash2 className="size-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}

function initialDraft() {
  return {
    obligation: '',
    type: 'APPROVAL',
    responsiblePerson: '',
    responsibleEmail: '',
    slaBusinessDays: '5',
    isContractual: true,
    notes: '',
  }
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}
