'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle, Diamond, Flag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ActivityStatusBadge } from './ProjectBadges'
import type { PhaseNode, MilestoneNode, ActivityNode, ProjectDetail } from '../hooks/useProject'
import {
  useAddPhase, useDeletePhase, useAddMilestone, useDeleteMilestone,
  useAddActivity, useUpdateActivity, useDeleteActivity,
} from '../hooks/useProject'
import { MilestoneKeyResultLinker } from './okr/MilestoneKeyResultLinker'
import { ProjectDatePicker } from './ProjectDatePicker'
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_LABEL, SLIP_REASONS, SLIP_REASON_LABEL, SLIP_REASON_OWNER, type ActivityStatus, type OwnerParty, type SlipReason } from '../types'

const OWNER_LABEL: Record<OwnerParty, string> = { '360GROUND': '360Ground', CLIENT: 'Client', SHARED: 'Shared' }

/** yyyy-MM-dd from an ISO string (or '' when unset). */
const dateInputValue = (iso: string | null): string => (iso ? iso.slice(0, 10) : '')
const MS_DAY = 86_400_000

/** Non-blocking warning when a parent's child weights don't sum to ~100. */
function weightWarn(weights: number[]): boolean {
  if (!weights.length) return false
  return Math.abs(weights.reduce((s, w) => s + (w || 0), 0) - 100) > 0.01
}

export function ScheduleTree({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const addPhase = useAddPhase(project.id)
  const [addingPhase, setAddingPhase] = useState(false)
  const [phaseName, setPhaseName] = useState('')

  if (project.phases.length === 0 && !canEdit) {
    return <p className="rounded-card bg-surface-card p-6 text-center text-body-sm text-ink-secondary shadow-card">No schedule has been created yet.</p>
  }

  const phaseWeights = project.phases.map((p) => p.weight)

  return (
    <div className="space-y-3">
      {weightWarn(phaseWeights) && project.phases.length > 0 && (
        <WeightBadge label="Phase weights don't sum to 100%" />
      )}

      {project.phases.map((phase) => (
        <PhaseRow key={phase.id} projectId={project.id} objectiveId={project.objectiveId} phase={phase} canEdit={canEdit} baselined={!!project.baselineCommittedAt} />
      ))}

      {project.phases.length === 0 && (
        <div className="rounded-card border border-dashed border-ink-tertiary/40 p-8 text-center">
          <Flag className="mx-auto mb-2 size-6 text-ink-tertiary" />
          <p className="text-body text-ink-secondary">This project has no phases yet.</p>
          {canEdit && <p className="mt-1 text-body-sm text-ink-tertiary">Add your first phase to build the schedule.</p>}
        </div>
      )}

      {canEdit && (
        addingPhase ? (
          <form
            className="flex items-center gap-2 rounded-card bg-surface-card p-3 shadow-card"
            onSubmit={(e) => { e.preventDefault(); if (phaseName.trim()) { addPhase.mutate({ name: phaseName.trim() }); setPhaseName(''); setAddingPhase(false) } }}
          >
            <input autoFocus className="input" placeholder="Phase name" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} />
            <button type="submit" className="btn btn-primary btn-sm">Add</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAddingPhase(false); setPhaseName('') }}>Cancel</button>
          </form>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setAddingPhase(true)}><Plus className="mr-1 size-4" /> Add Phase</button>
        )
      )}
    </div>
  )
}

function PhaseRow({ projectId, objectiveId, phase, canEdit, baselined }: { projectId: string; objectiveId: string | null; phase: PhaseNode; canEdit: boolean; baselined: boolean }) {
  const [open, setOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const [mName, setMName] = useState('')
  const addMilestone = useAddMilestone(projectId)
  const delPhase = useDeletePhase(projectId)
  const [confirmDel, setConfirmDel] = useState(false)

  const milestoneWeights = phase.milestones.map((m) => m.weight)

  return (
    <div className="overflow-hidden rounded-card bg-surface-card shadow-card">
      <div className="flex items-center gap-2 bg-ink-primary/[0.03] px-3 py-2.5">
        <button onClick={() => setOpen((v) => !v)} className="text-ink-secondary">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <span className="text-body font-semibold text-ink-primary">{phase.name}</span>
        <span className="text-body-sm text-ink-tertiary">· weight {phase.weight}%</span>
        {weightWarn(milestoneWeights) && <WeightBadge label="milestone weights ≠ 100%" compact />}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-body-sm font-medium tabular-nums text-ink-secondary">{phase.percentComplete.toFixed(0)}%</span>
          {canEdit && (
            <button className="text-ink-tertiary hover:text-danger-500" onClick={() => setConfirmDel(true)} aria-label="Delete phase">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="divide-y divide-black/[0.04]">
          {phase.milestones.map((m) => (
            <MilestoneRow key={m.id} projectId={projectId} objectiveId={objectiveId} milestone={m} canEdit={canEdit} baselined={baselined} />
          ))}
          {canEdit && (
            <div className="px-3 py-2">
              {adding ? (
                <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (mName.trim()) { addMilestone.mutate({ phaseId: phase.id, name: mName.trim() }); setMName(''); setAdding(false) } }}>
                  <input autoFocus className="input" placeholder="Milestone name" value={mName} onChange={(e) => setMName(e.target.value)} />
                  <button type="submit" className="btn btn-primary btn-sm">Add</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setMName('') }}>Cancel</button>
                </form>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}><Plus className="mr-1 size-4" /> Add Milestone</button>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => { delPhase.mutate({ phaseId: phase.id }); setConfirmDel(false) }}
        title="Delete phase?"
        message={`"${phase.name}" and all its milestones and activities will be permanently deleted.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}

function MilestoneRow({ projectId, objectiveId, milestone, canEdit, baselined }: { projectId: string; objectiveId: string | null; milestone: MilestoneNode; canEdit: boolean; baselined: boolean }) {
  const [adding, setAdding] = useState(false)
  const [aTitle, setATitle] = useState('')
  const addActivity = useAddActivity(projectId)
  const delMilestone = useDeleteMilestone(projectId)
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div className="px-3 py-2 pl-8">
      <div className="flex items-center gap-2">
        {milestone.isKeyMilestone && <Diamond className="size-3.5 fill-primary-500 text-primary-500" />}
        <span className="text-body font-medium text-ink-primary">{milestone.name}</span>
        <span className="text-body-sm text-ink-tertiary">· {milestone.weight}%</span>
        <span className="ml-auto text-body-sm tabular-nums text-ink-secondary">{milestone.percentComplete.toFixed(0)}%</span>
        <MilestoneKeyResultLinker
          projectId={projectId}
          milestoneId={milestone.id}
          objectiveId={objectiveId}
          keyResultId={milestone.keyResultId}
          canEdit={canEdit}
        />
        {canEdit && (
          <button className="text-ink-tertiary hover:text-danger-500" onClick={() => setConfirmDel(true)} aria-label="Delete milestone">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <div className="mt-1.5 space-y-1">
        {milestone.activities.filter((a) => !a.parentActivityId).map((a) => (
          <ActivityRow key={a.id} projectId={projectId} activity={a} subtasks={milestone.activities.filter((s) => s.parentActivityId === a.id)} canEdit={canEdit} baselined={baselined} />
        ))}
      </div>

      {canEdit && (
        <div className="mt-1.5">
          {adding ? (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (aTitle.trim()) { addActivity.mutate({ milestoneId: milestone.id, title: aTitle.trim() }); setATitle(''); setAdding(false) } }}>
              <input autoFocus className="input" placeholder="Activity title" value={aTitle} onChange={(e) => setATitle(e.target.value)} />
              <button type="submit" className="btn btn-primary btn-sm">Add</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setATitle('') }}>Cancel</button>
            </form>
          ) : (
            <button className="text-body-sm text-primary-600 hover:underline" onClick={() => setAdding(true)}>+ Add activity</button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => { delMilestone.mutate({ milestoneId: milestone.id }); setConfirmDel(false) }}
        title="Delete milestone?"
        message={`"${milestone.name}" and its activities will be permanently deleted.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}

interface SlipPending {
  field: 'currentStart' | 'currentEnd'
  /** yyyy-MM-dd or null (cleared). */
  value: string | null
}

function ActivityRow({ projectId, activity, subtasks, canEdit, baselined }: { projectId: string; activity: ActivityNode; subtasks: ActivityNode[]; canEdit: boolean; baselined: boolean }) {
  const update = useUpdateActivity(projectId)
  const del = useDeleteActivity(projectId)
  const hasSubtasks = subtasks.length > 0
  const [slipPending, setSlipPending] = useState<SlipPending | null>(null)

  const onDateChange = (field: 'currentStart' | 'currentEnd', raw: string) => {
    const value = raw || null
    const current = activity[field] ? activity[field]!.slice(0, 10) : null
    if (value === current) return
    if (!baselined) {
      update.mutate({ activityId: activity.id, [field]: value })
    } else {
      // C4 hard gate: date moves on a baselined project require reason + owner.
      setSlipPending({ field, value })
    }
  }

  return (
    <div className="rounded-md pl-4">
      <div className="flex items-center gap-2 py-1">
        <span className="min-w-0 flex-1 truncate text-body-sm text-ink-primary">{activity.title}</span>
        <span className="text-body-sm text-ink-tertiary">{OWNER_LABEL[activity.ownerParty]}</span>

        {canEdit ? (
          <div className="flex items-center gap-1">
            <ProjectDatePicker
              className="h-8 w-32"
              showIcon={false}
              displayFormat="dd/MM/yy"
              value={dateInputValue(activity.currentStart)}
              onChange={(value) => onDateChange('currentStart', value)}
              ariaLabel={`Start date for ${activity.title}`}
            />
            <span className="text-body-sm text-ink-tertiary">–</span>
            <ProjectDatePicker
              className="h-8 w-32"
              showIcon={false}
              displayFormat="dd/MM/yy"
              value={dateInputValue(activity.currentEnd)}
              onChange={(value) => onDateChange('currentEnd', value)}
              ariaLabel={`End date for ${activity.title}`}
            />
          </div>
        ) : (
          <span className="text-body-sm tabular-nums text-ink-tertiary">
            {dateInputValue(activity.currentStart) || '—'} – {dateInputValue(activity.currentEnd) || '—'}
          </span>
        )}

        {canEdit ? (
          <select
            className="rounded-md border border-black/[0.08] bg-surface-card px-1.5 py-0.5 text-body-sm"
            value={activity.status}
            onChange={(e) => update.mutate({ activityId: activity.id, status: e.target.value })}
          >
            {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{ACTIVITY_STATUS_LABEL[s]}</option>)}
          </select>
        ) : (
          <ActivityStatusBadge status={activity.status as ActivityStatus} />
        )}

        <div className="flex w-24 items-center gap-1">
          <input
            type="number" min={0} max={100} disabled={!canEdit || hasSubtasks}
            className="w-14 rounded-md border border-black/[0.08] bg-surface-card px-1.5 py-0.5 text-right text-body-sm tabular-nums disabled:opacity-60"
            value={Math.round(activity.percentComplete)}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Number(e.target.value)))
              update.mutate({ activityId: activity.id, percentComplete: v })
            }}
          />
          <span className="text-body-sm text-ink-tertiary">%</span>
        </div>

        {activity.slipDays > 0 && (
          <span className="rounded-pill bg-danger-50 px-1.5 py-0.5 text-[11px] font-medium text-danger-700" title="Days slipped vs baseline">+{activity.slipDays}d</span>
        )}

        {canEdit && (
          <button className="text-ink-tertiary hover:text-danger-500" onClick={() => del.mutate({ activityId: activity.id })} aria-label="Delete activity">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <SlipReasonDialog
        pending={slipPending}
        activity={activity}
        isLoading={update.isPending}
        onClose={() => setSlipPending(null)}
        onConfirm={({ slipReason, slipOwner, slipDetail }) => {
          if (!slipPending) return
          update.mutate(
            {
              activityId: activity.id,
              [slipPending.field]: slipPending.value,
              slipReason,
              slipOwner,
              ...(slipDetail ? { slipDetail } : {}),
            },
            { onSettled: () => setSlipPending(null) }
          )
        }}
      />

      {hasSubtasks && (
        <div className="ml-4 border-l border-black/[0.06] pl-3">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2 py-0.5">
              <span className="min-w-0 flex-1 truncate text-body-sm text-ink-secondary">{s.title}</span>
              <ActivityStatusBadge status={s.status as ActivityStatus} />
              <span className="w-10 text-right text-body-sm tabular-nums text-ink-tertiary">{Math.round(s.percentComplete)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** C4 slip-attribution modal — fires on any date move once the project is baselined. */
function SlipReasonDialog({
  pending,
  activity,
  isLoading,
  onClose,
  onConfirm,
}: {
  pending: SlipPending | null
  activity: ActivityNode
  isLoading: boolean
  onClose: () => void
  onConfirm: (v: { slipReason: string; slipOwner: OwnerParty; slipDetail: string }) => void
}) {
  const [reason, setReason] = useState<SlipReason | ''>('')
  const [owner, setOwner] = useState<OwnerParty | ''>('')
  const [detail, setDetail] = useState('')

  const close = () => { setReason(''); setOwner(''); setDetail(''); onClose() }

  const newEndIso =
    pending?.field === 'currentEnd'
      ? pending.value
      : dateInputValue(activity.currentEnd) || null
  const baselineEnd = dateInputValue(activity.baselineEnd)
  const deltaDays =
    baselineEnd && newEndIso
      ? Math.round((new Date(newEndIso).getTime() - new Date(baselineEnd).getTime()) / MS_DAY)
      : null

  return (
    <ConfirmDialog
      open={!!pending}
      onClose={close}
      onConfirm={() => { if (reason && owner) onConfirm({ slipReason: reason, slipOwner: owner, slipDetail: detail.trim() }) }}
      title="Schedule Change — Reason Required"
      message={activity.title}
      variant="warning"
      confirmLabel="Record & Save"
      isLoading={isLoading}
      disabled={!reason || !owner}
      extraContent={
        <div className="space-y-3">
          <div className="text-body-sm text-ink-secondary">
            Baseline end: <span className="font-medium text-ink-primary">{baselineEnd || '—'}</span>
            {' · '}New end: <span className="font-medium text-ink-primary">{newEndIso || '—'}</span>
            {deltaDays != null && deltaDays !== 0 && (
              <span className={deltaDays > 0 ? 'ml-1 text-danger-600' : 'ml-1 text-success-600'}>
                ({deltaDays > 0 ? '+' : ''}{deltaDays}d)
              </span>
            )}
          </div>
          <fieldset>
            <legend className="text-body-sm text-ink-secondary">Who caused this delay? *</legend>
            <div className="mt-1 flex gap-3">
              {(['360GROUND', 'CLIENT', 'SHARED'] as const).map((o) => (
                <label key={o} className="flex items-center gap-1.5 text-body-sm text-ink-primary">
                  <input type="radio" name={`slip-owner-${activity.id}`} checked={owner === o} onChange={() => setOwner(o)} />
                  {OWNER_LABEL[o]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Reason *</span>
            <select
              className="input mt-1 w-full"
              value={reason}
              onChange={(e) => {
                const r = e.target.value as SlipReason | ''
                setReason(r)
                if (r) setOwner(SLIP_REASON_OWNER[r]) // auto-suggest; still overridable
              }}
            >
              <option value="">Select a reason…</option>
              {SLIP_REASONS.map((r) => <option key={r} value={r}>{SLIP_REASON_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Detail (optional)</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={2000}
              rows={2}
              className="input mt-1 w-full"
              placeholder="What happened?"
            />
          </label>
        </div>
      }
    />
  )
}

function WeightBadge({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-pill bg-warning-50 text-warning-700', compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-body-sm')}>
      <AlertTriangle className={compact ? 'size-3' : 'size-3.5'} /> {label}
    </span>
  )
}
