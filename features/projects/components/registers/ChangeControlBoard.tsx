'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, FileText, Plus, Trash2, XCircle } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { CHANGE_REQUEST_TYPES } from '../../types'
import {
  useAddChangeRequest,
  useChangeRequests,
  useDeleteChangeRequest,
  useUpdateChangeRequest,
  type ChangeRequestNode,
  type ProjectDetail,
} from '../../hooks/useProject'

const TYPE_LABEL: Record<string, string> = {
  SCOPE_ADD: 'Scope add',
  REQUIREMENT_CHANGE: 'Requirement change',
  DESCOPE: 'Descope',
}

const STATUS_TONE: Record<string, string> = {
  SUBMITTED: 'bg-warning-50 text-warning-700',
  UNDER_REVIEW: 'bg-primary-50 text-primary-700',
  APPROVED: 'bg-success-50 text-success-700',
  REJECTED: 'bg-danger-50 text-danger-700',
  IMPLEMENTED: 'bg-surface-muted text-ink-secondary',
}

export function ChangeControlBoard({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const { data, isLoading } = useChangeRequests(project.id)
  const addCr = useAddChangeRequest(project.id)
  const updateCr = useUpdateChangeRequest(project.id)
  const deleteCr = useDeleteChangeRequest(project.id)
  const activities = useMemo(() => flattenActivities(project), [project])
  const [draft, setDraft] = useState(() => initialDraft())
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  const rows = data?.rows ?? []
  const pendingCount = rows.filter((row) => row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW').length

  const submit = async () => {
    if (!draft.title.trim() || !draft.description.trim() || !draft.requestedBy.trim()) return
    await addCr.mutateAsync({
      ...draft,
      scheduleImpactDays: Number(draft.scheduleImpactDays || 0),
      costImpact: Number(draft.costImpact || 0),
      affectedActivityIds: draft.affectedActivityIds,
    })
    setDraft(initialDraft())
  }

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-body-sm">
        <span className="font-medium text-ink-primary">Scope volatility: {data?.scopeVolatilityDays ?? 0}d</span>
        <span className={cn('rounded-pill px-2.5 py-1 font-medium', pendingCount ? 'bg-warning-50 text-warning-700' : 'bg-success-50 text-success-700')}>
          {pendingCount} pending for reports
        </span>
      </div>

      {canEdit && (
        <div className="mb-4 rounded-card border border-black/[0.08] p-3">
          <div className="mb-2 text-body-sm font-medium text-ink-primary">New Change Request</div>
          <div className="grid gap-2 lg:grid-cols-4">
            <input className="input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Title" />
            <select className="input" value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}>
              {CHANGE_REQUEST_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
            </select>
            <input className="input" value={draft.requestedBy} onChange={(e) => setDraft((d) => ({ ...d, requestedBy: e.target.value }))} placeholder="Requested by" />
            <select className="input" value={draft.requestedByParty} onChange={(e) => setDraft((d) => ({ ...d, requestedByParty: e.target.value }))}>
              <option value="CLIENT">Client</option>
              <option value="360GROUND">360Ground</option>
            </select>
          </div>
          <textarea className="input mt-2 w-full" rows={2} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} placeholder="Description and business reason" />
          <div className="mt-2 grid gap-2 lg:grid-cols-4">
            <input className="input" type="number" min={0} value={draft.scheduleImpactDays} onChange={(e) => setDraft((d) => ({ ...d, scheduleImpactDays: e.target.value }))} placeholder="Schedule impact days" />
            <input className="input" type="number" min={0} value={draft.costImpact} onChange={(e) => setDraft((d) => ({ ...d, costImpact: e.target.value }))} placeholder="Cost impact" />
            <input className="input" type="date" value={draft.requestDate} onChange={(e) => setDraft((d) => ({ ...d, requestDate: e.target.value }))} />
            <label className="flex items-center gap-2 rounded-md border border-black/[0.08] px-2 text-body-sm">
              <input type="checkbox" checked={draft.clientSignOff} onChange={(e) => setDraft((d) => ({ ...d, clientSignOff: e.target.checked }))} />
              Client sign-off captured
            </label>
          </div>
          <select
            className="input mt-2 w-full"
            multiple
            value={draft.affectedActivityIds}
            onChange={(e) => setDraft((d) => ({ ...d, affectedActivityIds: Array.from(e.target.selectedOptions).map((o) => o.value) }))}
          >
            {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.label}</option>)}
          </select>
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={addCr.isPending || !draft.title.trim() || !draft.description.trim() || !draft.requestedBy.trim()} onClick={() => void submit()}>
              <Plus className="mr-1 size-3.5" /> Add CR
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="No change requests logged" description="Approved changes will create scope-addition delay events and shift selected activity due dates." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
                <th className="px-2 py-1.5 font-medium">CR</th>
                <th className="px-2 py-1.5 font-medium">Request</th>
                <th className="px-2 py-1.5 font-medium">Impact</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                <th className="px-2 py-1.5 font-medium">Sign-off</th>
                {canEdit && <th className="px-2 py-1.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {rows.map((row) => (
                <ChangeRequestRow
                  key={row.id}
                  row={row}
                  canEdit={canEdit}
                  rejecting={rejectingId === row.id}
                  rejectionReason={rejectionReason}
                  setRejectionReason={setRejectionReason}
                  onStartReject={() => { setRejectingId(row.id); setRejectionReason('') }}
                  onCancelReject={() => { setRejectingId(null); setRejectionReason('') }}
                  onUpdate={(patch) => updateCr.mutate({ crId: row.id, ...patch })}
                  onReject={() => {
                    updateCr.mutate({ crId: row.id, status: 'REJECTED', rejectionReason }, {
                      onSuccess: () => { setRejectingId(null); setRejectionReason('') },
                    })
                  }}
                  onDelete={() => deleteCr.mutate({ crId: row.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ChangeRequestRow({
  row,
  canEdit,
  rejecting,
  rejectionReason,
  setRejectionReason,
  onStartReject,
  onCancelReject,
  onUpdate,
  onReject,
  onDelete,
}: {
  row: ChangeRequestNode
  canEdit: boolean
  rejecting: boolean
  rejectionReason: string
  setRejectionReason: (value: string) => void
  onStartReject: () => void
  onCancelReject: () => void
  onUpdate: (patch: Record<string, unknown>) => void
  onReject: () => void
  onDelete: () => void
}) {
  const canReview = row.status === 'SUBMITTED'
  const canDecide = row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW'
  const canImplement = row.status === 'APPROVED'
  const canDelete = row.status === 'SUBMITTED' || row.status === 'UNDER_REVIEW' || row.status === 'REJECTED'

  return (
    <tr>
      <td className="px-2 py-2 font-medium text-ink-primary">{row.crCode}</td>
      <td className="max-w-sm px-2 py-2">
        <div className="font-medium text-ink-primary">{row.title}</div>
        <div className="text-[12px] text-ink-tertiary">{TYPE_LABEL[row.type]} · {row.requestedByParty === '360GROUND' ? '360Ground' : 'Client'} · {row.requestedBy}</div>
      </td>
      <td className="px-2 py-2 text-ink-secondary">
        <span className="tabular-nums">+{row.scheduleImpactDays}d</span>
        {row.costImpact > 0 && <span className="ml-2 tabular-nums">{row.costImpact.toLocaleString()}</span>}
        <div className="text-[12px] text-ink-tertiary">{row.affectedActivityIds.length} affected</div>
      </td>
      <td className="px-2 py-2">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-medium', STATUS_TONE[row.status])}>{labelize(row.status)}</span>
      </td>
      <td className="px-2 py-2">
        {row.clientSignOff ? (
          <span className="text-success-700"><CheckCircle2 className="mr-1 inline size-3.5" />Signed</span>
        ) : canEdit ? (
          <button className="text-primary-700 hover:underline" onClick={() => onUpdate({ clientSignOff: true })}>Capture</button>
        ) : (
          <span className="text-ink-tertiary">Pending</span>
        )}
      </td>
      {canEdit && (
        <td className="px-2 py-2">
          {rejecting ? (
            <div className="flex min-w-56 flex-col gap-1">
              <input className="input h-8" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Rejection reason" />
              <div className="flex gap-1">
                <button className="btn btn-primary btn-sm" disabled={!rejectionReason.trim()} onClick={onReject}>Reject</button>
                <button className="btn btn-ghost btn-sm" onClick={onCancelReject}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {canReview && <button className="btn btn-outline btn-sm" onClick={() => onUpdate({ status: 'UNDER_REVIEW' })}>Review</button>}
              {canDecide && <button className="btn btn-primary btn-sm" onClick={() => onUpdate({ status: 'APPROVED' })}>Approve</button>}
              {canDecide && <button className="btn btn-outline btn-sm text-danger-600" onClick={onStartReject}><XCircle className="mr-1 size-3.5" />Reject</button>}
              {canImplement && <button className="btn btn-outline btn-sm" onClick={() => onUpdate({ status: 'IMPLEMENTED' })}>Implement</button>}
              {canDelete && <button className="rounded p-1 text-danger-600 hover:bg-danger-50" onClick={onDelete} title="Delete"><Trash2 className="size-3.5" /></button>}
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

interface ChangeRequestDraft {
  title: string
  description: string
  type: string
  requestedBy: string
  requestedByParty: string
  requestDate: string
  scheduleImpactDays: string
  costImpact: string
  affectedActivityIds: string[]
  clientSignOff: boolean
}

function initialDraft(): ChangeRequestDraft {
  return {
    title: '',
    description: '',
    type: 'SCOPE_ADD',
    requestedBy: '',
    requestedByParty: 'CLIENT',
    requestDate: new Date().toISOString().slice(0, 10),
    scheduleImpactDays: '0',
    costImpact: '0',
    affectedActivityIds: [],
    clientSignOff: false,
  }
}

function flattenActivities(project: ProjectDetail): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = []
  for (const phase of project.phases) {
    for (const milestone of phase.milestones) {
      for (const activity of milestone.activities) {
        out.push({ id: activity.id, label: `${phase.name} / ${milestone.name} / ${activity.title}` })
      }
    }
  }
  return out
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}
