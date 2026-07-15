'use client'

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle, BookOpenCheck, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import { COE_ROOT_CAUSE_CLASSES } from '../../types'
import {
  useAddCorrectionOfError,
  useCorrectionOfErrors,
  useDeleteCorrectionOfError,
  useUpdateCorrectionOfError,
  type CoeTriggerNode,
  type CorrectionOfErrorNode,
} from '../../hooks/useProject'

const STATUS_CLASS: Record<string, string> = {
  OPEN: 'bg-danger-50 text-danger-700',
  IN_PROGRESS: 'bg-warning-50 text-warning-700',
  DONE: 'bg-success-50 text-success-700',
}

export function CorrectionOfErrorsRegister({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data, isLoading } = useCorrectionOfErrors(projectId)
  const add = useAddCorrectionOfError(projectId)
  const update = useUpdateCorrectionOfError(projectId)
  const remove = useDeleteCorrectionOfError(projectId)
  const { users } = useUsersForSelection({ enabled: canEdit })
  const [draft, setDraft] = useState(initialDraft())

  if (isLoading) return <Skeleton className="h-80 w-full rounded-card" />

  const rows = data?.rows ?? []
  const triggers = data?.triggers ?? []
  const ownerOptions = users.map((u) => ({ id: u.id, label: u.name ?? u.email }))

  const submit = async () => {
    if (!draft.trigger.trim() || !draft.timeline.trim() || !draft.fixOwnerId || !draft.fixDueDate || !draft.systemicFix.trim()) return
    await add.mutateAsync({
      ...draft,
      daysLost: Number(draft.daysLost),
      costImpact: draft.costImpact.trim() ? Number(draft.costImpact) : null,
      fixDueDate: toIsoDate(draft.fixDueDate),
      fedIntoTemplate: draft.fedIntoTemplate,
    })
    setDraft(initialDraft())
  }

  return (
    <div className="rounded-card bg-surface-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {triggers.length > 0 && (
          <span className="rounded-pill bg-warning-50 px-2.5 py-1 text-body-sm font-medium text-warning-700">
            <AlertTriangle className="mr-1 inline size-3.5" /> {triggers.length} COE prompt{triggers.length === 1 ? '' : 's'}
          </span>
        )}
        {(data?.overdueCount ?? 0) > 0 && (
          <span className="rounded-pill bg-danger-50 px-2.5 py-1 text-body-sm font-medium text-danger-700">
            CEO dashboard: {data?.overdueCount} overdue open fix{data?.overdueCount === 1 ? '' : 'es'}
          </span>
        )}
        {data?.rootCausePareto.map((item) => (
          <span key={item.rootCauseClass} className="rounded-pill bg-surface-muted px-2.5 py-1 text-body-sm text-ink-secondary">
            {labelize(item.rootCauseClass)} {item.count}
          </span>
        ))}
      </div>

      {triggers.length > 0 && (
        <div className="mb-4 space-y-2">
          {triggers.map((trigger) => (
            <TriggerPrompt key={`${trigger.kind}-${trigger.trigger}`} trigger={trigger} canEdit={canEdit} onUse={() => setDraft((d) => ({ ...d, trigger: trigger.trigger, daysLost: String(trigger.daysLost) }))} />
          ))}
        </div>
      )}

      {canEdit && (
        <div className="mb-4 rounded-card border border-black/[0.08] p-3">
          <div className="mb-2 text-body-sm font-medium text-ink-primary">New Correction of Errors</div>
          <div className="grid gap-2 lg:grid-cols-4">
            <input className="input lg:col-span-2" value={draft.trigger} onChange={(e) => setDraft((d) => ({ ...d, trigger: e.target.value }))} placeholder="Trigger" />
            <input className="input" type="number" min={0} value={draft.daysLost} onChange={(e) => setDraft((d) => ({ ...d, daysLost: e.target.value }))} placeholder="Days lost" />
            <input className="input" type="number" min={0} value={draft.costImpact} onChange={(e) => setDraft((d) => ({ ...d, costImpact: e.target.value }))} placeholder="Cost impact" />
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-4">
            <select className="input" value={draft.rootCauseClass} onChange={(e) => setDraft((d) => ({ ...d, rootCauseClass: e.target.value }))}>
              {COE_ROOT_CAUSE_CLASSES.map((rootCause) => <option key={rootCause} value={rootCause}>{labelize(rootCause)}</option>)}
            </select>
            <select className="input" value={draft.fixOwnerId} onChange={(e) => setDraft((d) => ({ ...d, fixOwnerId: e.target.value }))}>
              <option value="">Fix owner</option>
              {ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
            </select>
            <input className="input" type="date" value={draft.fixDueDate} onChange={(e) => setDraft((d) => ({ ...d, fixDueDate: e.target.value }))} />
            <label className="flex items-center gap-2 rounded-md border border-black/[0.08] px-2 text-body-sm">
              <input type="checkbox" checked={draft.fedIntoTemplate} onChange={(e) => setDraft((d) => ({ ...d, fedIntoTemplate: e.target.checked }))} />
              Feed into template
            </label>
          </div>
          <textarea className="input mt-2 w-full" rows={2} value={draft.timeline} onChange={(e) => setDraft((d) => ({ ...d, timeline: e.target.value }))} placeholder="Factual sequence / timeline" />
          <div className="mt-2 grid gap-2 lg:grid-cols-5">
            {draft.whys.map((why, index) => (
              <div key={index} className="rounded-md border border-black/[0.08] p-2">
                <input className="input h-8 w-full text-[12px]" value={why.why} onChange={(e) => updateWhy(index, 'why', e.target.value, setDraft)} placeholder={`Why ${index + 1}`} />
                <textarea className="input mt-1 min-h-16 w-full text-[12px]" value={why.answer} onChange={(e) => updateWhy(index, 'answer', e.target.value, setDraft)} placeholder="Answer" />
              </div>
            ))}
          </div>
          <textarea className="input mt-2 w-full" rows={2} value={draft.systemicFix} onChange={(e) => setDraft((d) => ({ ...d, systemicFix: e.target.value }))} placeholder="Systemic fix / mechanism that prevents recurrence" />
          <div className="mt-2 flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={!draft.trigger.trim() || !draft.timeline.trim() || !draft.fixOwnerId || !draft.systemicFix.trim() || add.isPending} onClick={() => void submit()}>
              <Plus className="mr-1 size-3.5" /> Add COE
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="No COEs recorded" description="Milestone slips over 10 days and RED projects create prompts here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-black/[0.08] text-left text-ink-tertiary">
                <th className="px-2 py-1.5 font-medium">COE</th>
                <th className="px-2 py-1.5 font-medium">Root Cause</th>
                <th className="px-2 py-1.5 font-medium">Fix</th>
                <th className="px-2 py-1.5 font-medium">5-Whys</th>
                <th className="px-2 py-1.5 font-medium">Lessons</th>
                {canEdit && <th className="px-2 py-1.5 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {rows.map((row) => (
                <CoeRow
                  key={row.id}
                  row={row}
                  canEdit={canEdit}
                  ownerName={ownerOptions.find((owner) => owner.id === row.fixOwnerId)?.label}
                  onUpdate={(patch) => update.mutate({ coeId: row.id, ...patch })}
                  onDelete={() => remove.mutate({ coeId: row.id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(data?.lessonsLearned.length ?? 0) > 0 && (
        <div className="mt-4 rounded-card border border-success-500/20 bg-success-50 p-3">
          <div className="mb-2 text-body-sm font-medium text-success-700">Lessons Learned Register</div>
          <div className="space-y-1">
            {data?.lessonsLearned.map((lesson) => (
              <div key={lesson.id} className="text-body-sm text-success-800">
                <span className="font-medium">{lesson.coeCode}</span> · {labelize(lesson.rootCauseClass)} · {lesson.systemicFix}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TriggerPrompt({ trigger, canEdit, onUse }: { trigger: CoeTriggerNode; canEdit: boolean; onUse: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-warning-500/20 bg-warning-50 px-3 py-2">
      <AlertTriangle className="size-4 text-warning-700" />
      <div className="flex-1 text-body-sm text-warning-800">{trigger.trigger}</div>
      {canEdit && <button className="btn btn-outline btn-sm bg-white" onClick={onUse}>Create COE</button>}
    </div>
  )
}

function CoeRow({ row, canEdit, ownerName, onUpdate, onDelete }: {
  row: CorrectionOfErrorNode
  canEdit: boolean
  ownerName?: string
  onUpdate: (patch: Record<string, unknown>) => void
  onDelete: () => void
}) {
  return (
    <tr>
      <td className="max-w-md px-2 py-2">
        <div className="font-medium text-ink-primary">{row.coeCode}</div>
        <div className="text-[12px] text-ink-secondary">{row.trigger}</div>
        <div className="mt-1 text-[12px] text-ink-tertiary">{row.daysLost} days lost{row.costImpact != null ? ` · ${row.costImpact.toLocaleString()} cost` : ''}</div>
      </td>
      <td className="px-2 py-2">
        <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[12px] text-ink-secondary">{labelize(row.rootCauseClass)}</span>
      </td>
      <td className="px-2 py-2 text-ink-secondary">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-medium', STATUS_CLASS[row.fixStatus])}>{labelize(row.fixStatus)}</span>
        {row.isOverdue && <div className="mt-1 text-[12px] font-medium text-danger-700">Overdue</div>}
        <div className="mt-1 text-[12px] text-ink-tertiary">{fmtDate(row.fixDueDate)} · {ownerName ?? 'Owner assigned'}</div>
      </td>
      <td className="px-2 py-2">
        <span className={cn('rounded-pill px-2 py-0.5 text-[12px] font-medium', row.whysComplete ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700')}>
          {row.whysComplete ? 'Complete' : `${row.whys.filter((why) => why.why && why.answer).length}/5`}
        </span>
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <button className={cn('rounded-md px-2 py-1 text-[12px] font-medium', row.fedIntoTemplate ? 'bg-success-50 text-success-700' : 'bg-surface-muted text-ink-secondary')} onClick={() => onUpdate({ fedIntoTemplate: !row.fedIntoTemplate })}>
            {row.fedIntoTemplate ? 'Fed back' : 'Pending'}
          </button>
        ) : row.fedIntoTemplate ? 'Fed back' : 'Pending'}
      </td>
      {canEdit && (
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            {row.fixStatus === 'OPEN' && <button className="rounded p-1 text-warning-700 hover:bg-warning-50" onClick={() => onUpdate({ fixStatus: 'IN_PROGRESS' })} title="Start fix"><CheckCircle2 className="size-3.5" /></button>}
            {row.fixStatus !== 'DONE' && <button className="btn btn-outline btn-sm" onClick={() => onUpdate({ fixStatus: 'DONE' })}>Done</button>}
            <button className="rounded p-1 text-danger-600 hover:bg-danger-50" onClick={onDelete} title="Delete">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}

function initialDraft() {
  return {
    trigger: '',
    daysLost: '0',
    costImpact: '',
    timeline: '',
    whys: Array.from({ length: 5 }, () => ({ why: '', answer: '' })),
    rootCauseClass: 'PLANNING',
    systemicFix: '',
    fixOwnerId: '',
    fixDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    fixStatus: 'OPEN',
    fedIntoTemplate: false,
  }
}

function updateWhy(index: number, field: 'why' | 'answer', value: string, setDraft: Dispatch<SetStateAction<ReturnType<typeof initialDraft>>>) {
  setDraft((draft) => ({
    ...draft,
    whys: draft.whys.map((why, i) => i === index ? { ...why, [field]: value } : why),
  }))
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

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}
