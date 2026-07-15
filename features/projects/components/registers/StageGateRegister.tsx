'use client'

import { useState } from 'react'
import { DoorOpen, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { STAGE_GATE_STATUSES, type StageGateStatus } from '../../types'
import {
  useAddStageGate,
  useDeleteStageGate,
  useStageGates,
  useUpdateStageGate,
  type ProjectDetail,
  type StageGateNode,
} from '../../hooks/useProject'

const STATUS_TONE: Record<StageGateStatus, string> = {
  NOT_REACHED: 'bg-surface-muted text-ink-secondary',
  PENDING: 'bg-warning-50 text-warning-700',
  PASSED: 'bg-success-50 text-success-700',
  FAILED: 'bg-danger-50 text-danger-700',
  WAIVED: 'bg-primary-50 text-primary-700',
}

export function StageGateRegister({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const { data: gates, isLoading } = useStageGates(project.id)
  const addGate = useAddStageGate(project.id)
  const updateGate = useUpdateStageGate(project.id)
  const deleteGate = useDeleteStageGate(project.id)
  const [draft, setDraft] = useState(() => initialDraft(project.phases[0]?.id ?? ''))

  if (isLoading) return <Skeleton className="h-72 w-full rounded-card" />

  const rows = gates ?? []
  const gatedPhaseIds = new Set(rows.map((gate) => gate.phaseId))
  const phasesWithoutGate = project.phases.filter((phase) => !gatedPhaseIds.has(phase.id))

  const submit = async () => {
    if (!draft.phaseId || !draft.name.trim()) return
    await addGate.mutateAsync({
      ...draft,
      entryCriteria: draft.entryCriteria,
      exitCriteria: draft.exitCriteria,
      requiredDeliverables: draft.requiredDeliverables,
      requiredApprovals: draft.requiredApprovals,
    })
    const nextPhaseId = phasesWithoutGate.find((p) => p.id !== draft.phaseId)?.id ?? ''
    setDraft(initialDraft(nextPhaseId))
  }

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      {canEdit && phasesWithoutGate.length > 0 && (
        <div className="mb-4 rounded-card border border-black/[0.08] p-3">
          <div className="mb-2 text-body-sm font-medium text-ink-primary">New Stage Gate</div>
          <div className="grid gap-2 md:grid-cols-2">
            <select className="input" value={draft.phaseId} onChange={(e) => setDraft((d) => ({ ...d, phaseId: e.target.value }))}>
              <option value="">Select phase</option>
              {phasesWithoutGate.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
            </select>
            <input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Gate name" />
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-4">
            <ChecklistBox label="Entry criteria" value={draft.entryCriteria} onChange={(v) => setDraft((d) => ({ ...d, entryCriteria: v }))} />
            <ChecklistBox label="Exit criteria" value={draft.exitCriteria} onChange={(v) => setDraft((d) => ({ ...d, exitCriteria: v }))} />
            <ChecklistBox label="Deliverables" value={draft.requiredDeliverables} onChange={(v) => setDraft((d) => ({ ...d, requiredDeliverables: v }))} />
            <ChecklistBox label="Approvals" value={draft.requiredApprovals} onChange={(v) => setDraft((d) => ({ ...d, requiredApprovals: v }))} />
          </div>
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={!draft.phaseId || !draft.name.trim() || addGate.isPending} onClick={() => void submit()}>
              <Plus className="mr-1 size-3.5" /> Add Gate
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={DoorOpen} title="No stage gates configured" description="Add gates to require phase approvals before the next phase starts." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
                <th className="px-2 py-1.5 font-medium">Phase</th>
                <th className="px-2 py-1.5 font-medium">Gate</th>
                <th className="px-2 py-1.5 font-medium">Checklists</th>
                <th className="px-2 py-1.5 font-medium">Status</th>
                {canEdit && <th className="px-2 py-1.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {rows.map((gate) => (
                <StageGateRow
                  key={gate.id}
                  gate={gate}
                  canEdit={canEdit}
                  onUpdate={(patch) => updateGate.mutate({ gateId: gate.id, ...patch })}
                  onDelete={() => deleteGate.mutate({ gateId: gate.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StageGateRow({ gate, canEdit, onUpdate, onDelete }: {
  gate: StageGateNode
  canEdit: boolean
  onUpdate: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  const waive = () => {
    const reason = window.prompt('Waiver reason:')
    if (!reason?.trim()) return
    onUpdate({ status: 'WAIVED', waiverReason: reason.trim() })
  }

  return (
    <tr>
      <td className="px-2 py-2 text-ink-secondary">{gate.phase?.name ?? 'Phase'}</td>
      <td className="max-w-xs px-2 py-2">
        <div className="font-medium text-ink-primary">{gate.name}</div>
        {gate.waiverReason && <div className="line-clamp-2 text-[12px] text-primary-700">Waived: {gate.waiverReason}</div>}
      </td>
      <td className="px-2 py-2 text-ink-secondary">
        <div>Entry {gate.entryCriteria.length} · Exit {gate.exitCriteria.length}</div>
        <div className="text-[12px] text-ink-tertiary">Deliverables {gate.requiredDeliverables.length} · Approvals {gate.requiredApprovals.length}</div>
      </td>
      <td className="px-2 py-2">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-medium', STATUS_TONE[gate.status])}>{labelize(gate.status)}</span>
      </td>
      {canEdit && (
        <td className="px-2 py-2">
          <div className="flex flex-wrap items-center gap-1">
            {gate.status !== 'PASSED' && (
              <button className="btn btn-primary btn-sm" onClick={() => onUpdate({ status: 'PASSED' })}>
                <ShieldCheck className="mr-1 size-3.5" /> Pass
              </button>
            )}
            {gate.status !== 'WAIVED' && <button className="btn btn-outline btn-sm" onClick={waive}>Waive</button>}
            {STAGE_GATE_STATUSES.filter((s) => s !== 'PASSED' && s !== 'WAIVED').map((status) => (
              status !== gate.status && <button key={status} className="btn btn-outline btn-sm" onClick={() => onUpdate({ status })}>{labelize(status)}</button>
            ))}
            <button className="rounded p-1 text-danger-600 hover:bg-danger-50" onClick={onDelete} title="Delete">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

function ChecklistBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[12px] text-ink-tertiary">{label}</span>
      <textarea className="input mt-1 w-full" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder="One per line" />
    </label>
  )
}

function initialDraft(phaseId: string) {
  return {
    phaseId,
    name: '',
    entryCriteria: '',
    exitCriteria: '',
    requiredDeliverables: '',
    requiredApprovals: '',
  }
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}
