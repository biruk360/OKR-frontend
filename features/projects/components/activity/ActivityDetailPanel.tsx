'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Diamond,
  Folder,
  Link2,
  ListChecks,
  MessageSquare,
  Paperclip,
  Palette,
  Plus,
  Reply,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import SideDrawer from '@/components/ui/SideDrawer'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MentionEditor } from '@/components/todos/MentionEditor'
import { businessDaysBetween } from '@/lib/projects/business-days'
import { cn } from '@/lib/utils'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { ProjectDatePicker } from '../ProjectDatePicker'
import {
  ACTIVITY_STATUS_LABEL,
  ACTIVITY_STATUSES,
  OWNER_PARTIES,
  PRIORITIES,
  RISK_LEVELS,
  SLIP_REASONS,
  SLIP_REASON_LABEL,
  SLIP_REASON_OWNER,
  type ActivityStatus,
  type DependencyType,
  type OwnerParty,
  type SlipReason,
  type Visibility,
} from '../../types'
import {
  useActivityComments,
  useActivityAttachments,
  useAddActivityComment,
  useDeleteActivityComment,
  useAddActivity,
  useDeleteActivity,
  useDeleteActivityAttachment,
  useDeleteActivityDependency,
  useUpdateActivityComment,
  useUpdateActivity,
  useUploadActivityAttachment,
  useCreateActivityDependency,
  useJiraMappingPreview,
  type ActivityCommentNode,
  type ActivityNode,
  type MilestoneNode,
  type PhaseNode,
  type ProjectDetail,
} from '../../hooks/useProject'

interface Props {
  project: ProjectDetail
  activityId: string | null
  canEdit: boolean
  onClose: () => void
}

interface ActivityContext {
  activity: ActivityNode
  milestone: MilestoneNode
  phase: PhaseNode
  siblings: ActivityNode[]
  subtasks: ActivityNode[]
}

const APPROVAL_SLA_DAYS = 3
type JiraMappingType = 'MANUAL' | 'EPIC' | 'LABEL' | 'COMPONENT' | 'SPRINT'

export function ActivityDetailPanel({ project, activityId, canEdit, onClose }: Props) {
  const updateActivity = useUpdateActivity(project.id)
  const deleteActivity = useDeleteActivity(project.id)
  const addActivity = useAddActivity(project.id)
  const createDependency = useCreateActivityDependency(project.id)
  const deleteDependency = useDeleteActivityDependency(project.id)
  const { users } = useUsersForSelection({ enabled: !!activityId })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [commentHtml, setCommentHtml] = useState('')
  const [commentVisibility, setCommentVisibility] = useState<Visibility>('INTERNAL')
  const [replyTo, setReplyTo] = useState<ActivityCommentNode | null>(null)
  const [pendingDatePatch, setPendingDatePatch] = useState<{ patch: Record<string, unknown>; undoPatch: Record<string, unknown> } | null>(null)
  const [pendingGateOverride, setPendingGateOverride] = useState<{ patch: Record<string, unknown>; undoPatch?: Record<string, unknown>; message: string } | null>(null)
  const [gateOverrideReason, setGateOverrideReason] = useState('')
  const [slipReason, setSlipReason] = useState<SlipReason | ''>('')
  const [slipOwner, setSlipOwner] = useState<OwnerParty>('CLIENT')
  const [slipDetail, setSlipDetail] = useState('')
  const [jiraMappingType, setJiraMappingType] = useState<JiraMappingType>('MANUAL')
  const [jiraMappingValues, setJiraMappingValues] = useState('')
  const [jiraAutoRollup, setJiraAutoRollup] = useState(false)
  const [predecessorId, setPredecessorId] = useState('')
  const [dependencyType, setDependencyType] = useState<DependencyType>('FS')
  const ctx = useMemo(() => activityId ? findActivityContext(project, activityId) : null, [project, activityId])
  const activity = ctx?.activity ?? null
  const jiraPreview = useJiraMappingPreview(project.id, jiraMappingType, jiraMappingValues, Boolean(project.jiraLinked && activity))
  const activityComments = useActivityComments(project.id, activity?.id)
  const activityAttachments = useActivityAttachments(project.id, activity?.id)
  const addComment = useAddActivityComment(project.id, activity?.id ?? '')
  const updateComment = useUpdateActivityComment(project.id, activity?.id ?? '')
  const deleteComment = useDeleteActivityComment(project.id, activity?.id ?? '')
  const uploadAttachment = useUploadActivityAttachment(project.id, activity?.id ?? '')
  const deleteAttachment = useDeleteActivityAttachment(project.id, activity?.id ?? '')
  const activityOptions = useMemo(() => project.phases.flatMap((phase) => phase.milestones.flatMap((milestone) => milestone.activities.map((item) => ({
    id: item.id,
    title: item.title,
    phase: phase.name,
  })))), [project.phases])
  const activityTitleById = useMemo(() => new Map(activityOptions.map((item) => [item.id, item.title])), [activityOptions])
  const incomingDependencies = useMemo(() => activity ? project.dependencies.filter((item) => item.successorId === activity.id) : [], [activity, project.dependencies])
  const outgoingDependencies = useMemo(() => activity ? project.dependencies.filter((item) => item.predecessorId === activity.id) : [], [activity, project.dependencies])
  const availablePredecessors = useMemo(() => activityOptions.filter((item) => item.id !== activity?.id && !incomingDependencies.some((dependency) => dependency.predecessorId === item.id)), [activity?.id, activityOptions, incomingDependencies])

  useEffect(() => {
    setCommentHtml('')
    setCommentVisibility('INTERNAL')
    setReplyTo(null)
    setPredecessorId('')
    setDependencyType('FS')
    if (activity) {
      const mapping = parseClientJiraMapping(activity.jiraIssueKeys)
      setJiraMappingType(mapping.type)
      setJiraMappingValues(mapping.values.join(', '))
      setJiraAutoRollup(activity.jiraAutoRollup)
    }
  }, [activity?.id])

  const savePatch = async (patch: Record<string, unknown>, undoPatch?: Record<string, unknown>) => {
    if (!activity || !canEdit) return
    try {
      await updateActivity.mutateAsync({ activityId: activity.id, ...patch })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stage gate has not passed. Proceed anyway?'
      if (patch.status === 'STARTED' && /has not passed/i.test(message) && !patch.gateOverrideReason) {
        setPendingGateOverride({ patch, undoPatch, message })
        setGateOverrideReason('')
      }
      return
    }
    if (undoPatch && Object.keys(undoPatch).length) {
      toast.custom((t) => (
        <div className="flex items-center gap-3 rounded-md bg-ink-primary px-3 py-2 text-body-sm text-white shadow-popover">
          <span>Activity updated</span>
          <button
            className="rounded bg-white/15 px-2 py-1 text-[12px] font-medium hover:bg-white/25"
            onClick={() => {
              toast.dismiss(t.id)
              updateActivity.mutate({ activityId: activity.id, ...undoPatch })
            }}
          >
            Undo
          </button>
        </div>
      ))
    }
  }

  const addSubtask = async () => {
    if (!activity || !ctx || !subtaskTitle.trim()) return
    await addActivity.mutateAsync({
      milestoneId: activity.milestoneId,
      parentActivityId: activity.id,
      title: subtaskTitle.trim(),
      ownerParty: activity.ownerParty,
      currentStart: activity.currentStart,
      currentEnd: activity.currentEnd,
      weight: 1,
    })
    setSubtaskTitle('')
  }

  const submitComment = async () => {
    if (!activity || !stripHtml(commentHtml)) return
    await addComment.mutateAsync({
      content: commentHtml,
      visibility: commentVisibility,
      parentId: replyTo?.id ?? null,
    })
    setCommentHtml('')
    setCommentVisibility('INTERNAL')
    setReplyTo(null)
  }

  const saveDatePatch = (patch: Record<string, unknown>, undoPatch: Record<string, unknown>) => {
    if (project.baselineCommittedAt) {
      setPendingDatePatch({ patch, undoPatch })
      setSlipReason('')
      setSlipOwner('CLIENT')
      setSlipDetail('')
      return
    }
    void savePatch(patch, undoPatch)
  }

  const previousSibling = ctx ? previousIndentTarget(ctx.activity, ctx.siblings) : null
  const waitingDays = activity?.waitingSince ? businessDaysBetween(new Date(activity.waitingSince), new Date()) : 0
  const daysOverSla = Math.max(0, waitingDays - APPROVAL_SLA_DAYS)
  const calendarDays = activity ? calendarDayCount(activity.currentStart, activity.currentEnd) : null
  const saveJiraMapping = () => {
    if (!activity) return
    const keys = buildClientJiraMappingKeys(jiraMappingType, splitCsv(jiraMappingValues))
    void savePatch({
      jiraIssueKeys: keys,
      jiraAutoRollup,
    }, {
      jiraIssueKeys: activity.jiraIssueKeys,
      jiraAutoRollup: activity.jiraAutoRollup,
    })
  }

  return (
    <SideDrawer open={!!activity} onClose={onClose} title={activity?.title ?? 'Task details'} width="lg" showHeader={false} contentClassName="p-0">
      {activity && ctx && (
        <div className="flex min-h-full flex-col gap-3 bg-[#f7f8fa] p-3 pb-5">
          <div className="order-1 -mx-3 -mt-3 flex min-h-12 flex-wrap items-center gap-1 border-b border-black/[0.08] bg-white px-3 py-2 pr-12">
            <button
              className="inline-flex h-8 items-center rounded-md bg-success-600 px-3 text-[12px] font-semibold text-white hover:bg-success-700 disabled:opacity-50"
              disabled={!canEdit || updateActivity.isPending}
              onClick={() => void savePatch({ status: 'FINISHED', percentComplete: 100 }, { status: activity.status, percentComplete: activity.percentComplete })}
            >
              <Check className="mr-1 size-3.5" /> Mark done
            </button>
            <button
              className="flex size-8 items-center justify-center rounded text-[#64748b] hover:bg-surface-hover hover:text-ink-primary disabled:opacity-30"
              disabled={!canEdit || !activity.parentActivityId || updateActivity.isPending}
              onClick={() => void savePatch({ parentActivityId: null }, { parentActivityId: activity.parentActivityId })}
              title="Outdent"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              className="flex size-8 items-center justify-center rounded text-[#64748b] hover:bg-surface-hover hover:text-ink-primary disabled:opacity-30"
              disabled={!canEdit || !!activity.parentActivityId || !previousSibling || updateActivity.isPending}
              onClick={() => previousSibling && void savePatch({ parentActivityId: previousSibling.id }, { parentActivityId: activity.parentActivityId })}
              title="Indent"
            >
              <ChevronRight className="size-3.5" />
            </button>
            <button
              className="flex size-8 items-center justify-center rounded text-[#64748b] hover:bg-surface-hover hover:text-ink-primary disabled:opacity-30"
              disabled={!canEdit || updateActivity.isPending}
              onClick={() => void savePatch({ isMilestone: !activity.isMilestone }, { isMilestone: activity.isMilestone })}
              title="Convert to milestone"
            >
              <Diamond className={cn('size-3.5', activity.isMilestone && 'fill-current')} />
            </button>
            <label className={cn('flex size-8 cursor-pointer items-center justify-center rounded text-[#64748b] hover:bg-surface-hover hover:text-ink-primary', !canEdit && 'pointer-events-none opacity-50')} title="Color">
              <Palette className="size-3.5" />
              <input
                type="color"
                className="sr-only"
                disabled={!canEdit}
                value={activity.color ?? '#007AFF'}
                onChange={(e) => void savePatch({ color: e.target.value }, { color: activity.color })}
              />
            </label>
            <button className="flex size-8 items-center justify-center rounded text-[#64748b] hover:bg-danger-50 hover:text-danger-600 disabled:opacity-30" disabled={!canEdit} onClick={() => setDeleteOpen(true)} title="Delete">
              <Trash2 className="size-3.5" />
            </button>
          </div>

          <div className="order-2 flex items-center gap-2 truncate text-[12px] text-ink-secondary">
            <Folder className="size-3.5 shrink-0 text-ink-tertiary" />
            <span className="font-medium text-ink-primary">{ctx.phase.name}</span>
            <span className="mx-2 text-ink-tertiary">/</span>
            <span>{ctx.milestone.name}</span>
          </div>

          <label className="order-3 block">
            <span className="sr-only">Title</span>
            <input
              className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[19px] font-semibold text-ink-primary outline-none hover:border-black/[0.08] focus:border-primary-400 focus:bg-white"
              defaultValue={activity.title}
              disabled={!canEdit}
              onBlur={(e) => {
                const title = e.target.value.trim()
                if (title && title !== activity.title) void savePatch({ title }, { title: activity.title })
              }}
            />
          </label>

          <label className="order-[9] block rounded-md border border-black/[0.08] bg-white p-3">
            <span className="text-[12px] font-medium text-ink-secondary">Description</span>
            <textarea
              className="mt-1 min-h-16 w-full resize-y rounded border border-transparent bg-transparent px-1 py-1 text-[13px] leading-5 text-ink-primary outline-none hover:border-black/[0.08] focus:border-primary-400"
              rows={2}
              defaultValue={activity.description ?? ''}
              disabled={!canEdit}
              onBlur={(e) => {
                const description = e.target.value.trim() || null
                if (description !== activity.description) void savePatch({ description }, { description: activity.description })
              }}
            />
          </label>

          <div className="order-4 grid gap-2 sm:grid-cols-2">
            <label className="rounded-md border border-black/[0.08] bg-white p-3">
              <span className="text-[11px] font-medium uppercase text-ink-tertiary">Assignee</span>
              <select
                className="mt-1 h-8 w-full rounded border border-transparent bg-transparent px-0 text-[14px] font-semibold text-ink-primary outline-none hover:border-black/[0.08] focus:border-primary-400"
                value={activity.assigneeId ?? ''}
                disabled={!canEdit || activity.ownerParty === 'CLIENT'}
                onChange={(e) => void savePatch({ assigneeId: e.target.value || null, ...(e.target.value ? { ownerParty: '360GROUND' } : {}) }, { assigneeId: activity.assigneeId, ownerParty: activity.ownerParty })}
              >
                <option value="">{activity.ownerParty === 'CLIENT' ? `${project.clientName} team` : 'Unassigned'}</option>
                {activity.assigneeId && !users.some((user) => user.id === activity.assigneeId) && <option value={activity.assigneeId} disabled>Unavailable account</option>}
                {users.length === 0 ? (
                  <option value="__none__" disabled>No active system users</option>
                ) : (
                  <optgroup label="360Ground team">
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <div className="rounded-md border border-black/[0.08] bg-white p-3">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase text-ink-tertiary"><CalendarDays className="size-3.5 text-primary-500" /> Dates <span className="ml-auto normal-case">{calendarDays == null ? '-' : `${calendarDays} CD`}</span></div>
              <div className="grid grid-cols-2 gap-2">
              <DateField label="Start" value={activity.currentStart} disabled={!canEdit} onSave={(currentStart) => saveDatePatch({ currentStart }, { currentStart: activity.currentStart })} />
              <DateField label="Due" value={activity.currentEnd} disabled={!canEdit} onSave={(currentEnd) => saveDatePatch({ currentEnd }, { currentEnd: activity.currentEnd })} />
              </div>
            </div>
          </div>

          <div className="order-[10] grid gap-2 rounded-md border border-black/[0.08] bg-white p-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-body-sm font-medium text-ink-primary">Owner party</span>
              <select
                className="input mt-1 w-full"
                value={activity.ownerParty}
                disabled={!canEdit}
                onChange={(event) => {
                  const ownerParty = event.target.value as OwnerParty
                  void savePatch(ownerParty === 'CLIENT' ? { ownerParty, assigneeId: null } : { ownerParty }, { ownerParty: activity.ownerParty, assigneeId: activity.assigneeId })
                }}
              >
                <option value="360GROUND">360Ground</option>
                <option value="CLIENT">{project.clientName}</option>
                <option value="SHARED">Shared</option>
              </select>
            </label>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-body-sm transition sm:mt-5',
                activity.isBlocked ? 'border-danger-500/30 bg-danger-50 text-danger-700' : 'border-black/[0.08] bg-surface-muted/40 text-ink-secondary'
              )}
              disabled={!canEdit || updateActivity.isPending}
              onClick={() => void savePatch({ isBlocked: !activity.isBlocked }, { isBlocked: activity.isBlocked })}
            >
              <span className="inline-flex items-center gap-2"><AlertTriangle className="size-4" /> {activity.isBlocked ? 'This activity is blocked' : 'No active blocker'}</span>
              <span className="font-medium">{activity.isBlocked ? 'Clear blocker' : 'Mark blocked'}</span>
            </button>
          </div>

          <div className="order-5 border-b border-black/[0.08] pb-3">
            <div className="mb-1 flex items-center justify-between text-body-sm">
              <span className="font-medium text-ink-primary">
                {Math.round(activity.percentComplete)}% complete{activity.jiraAutoRollup ? ' · Jira auto' : ''}
              </span>
              <select
                className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-[12px]"
                value={activity.status}
                disabled={!canEdit}
                onChange={(e) => void savePatch({ status: e.target.value as ActivityStatus }, { status: activity.status })}
              >
                {ACTIVITY_STATUSES.map((status) => <option key={status} value={status}>{ACTIVITY_STATUS_LABEL[status]}</option>)}
              </select>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-black/[0.06]">
              <div className="h-full rounded-pill bg-primary-500" style={{ width: `${Math.max(0, Math.min(100, activity.percentComplete))}%` }} />
            </div>
            {canEdit && <label className="mt-2 flex items-center justify-end gap-1 text-[12px] text-ink-secondary"><span>Completed</span><input className="input h-8 w-20 text-right" type="number" min={0} max={100} step={1} defaultValue={activity.percentComplete} onBlur={(e) => void savePatch({ percentComplete: Math.max(0, Math.min(100, Number(e.currentTarget.value))) }, { percentComplete: activity.percentComplete })} /><span>%</span></label>}
          </div>

          {project.jiraLinked && (
            <details className="group order-[12] overflow-hidden rounded-md border border-black/[0.08] bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-ink-primary hover:bg-surface-hover">
                <ChevronRight className="size-3.5 text-ink-tertiary transition-transform group-open:rotate-90" /> Jira rollup
                <span className="ml-auto text-[11px] font-normal text-ink-tertiary">{jiraAutoRollup ? 'Auto' : 'Manual'}</span>
              </summary>
              <div className="border-t border-black/[0.08] p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] text-ink-tertiary">Map synced Jira issues to this activity. Manual % edits turn auto-rollup off.</div>
                </div>
                <label className="flex items-center gap-2 text-body-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={jiraAutoRollup}
                    disabled={!canEdit}
                    onChange={(event) => setJiraAutoRollup(event.target.checked)}
                  />
                  Auto
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                <select
                  className="input"
                  value={jiraMappingType}
                  disabled={!canEdit}
                  onChange={(event) => setJiraMappingType(event.target.value as JiraMappingType)}
                >
                  <option value="MANUAL">Manual keys</option>
                  <option value="EPIC">Epic</option>
                  <option value="LABEL">Label</option>
                  <option value="COMPONENT">Component</option>
                  <option value="SPRINT">Sprint</option>
                </select>
                <input
                  className="input"
                  value={jiraMappingValues}
                  disabled={!canEdit}
                  onChange={(event) => setJiraMappingValues(event.target.value)}
                  placeholder={jiraMappingType === 'MANUAL' ? 'MEDA-1, MEDA-2' : jiraMappingType === 'SPRINT' ? '123' : 'auth-module'}
                />
                <button className="btn btn-primary" disabled={!canEdit || updateActivity.isPending} onClick={saveJiraMapping}>
                  Save
                </button>
              </div>
              <div className="mt-2 text-[12px] text-ink-secondary">
                {jiraPreview.isFetching ? 'Previewing mapping…' : jiraPreview.data
                  ? `${jiraPreview.data.doneIssues}/${jiraPreview.data.totalIssues} done · ${jiraPreview.data.percentComplete}%${jiraPreview.data.weightedByPoints ? ' by points' : ''}${jiraPreview.data.sampleIssueKeys.length ? ` · ${jiraPreview.data.sampleIssueKeys.join(', ')}` : ''}`
                  : splitCsv(jiraMappingValues).length > 0 ? 'No synced issues matched yet.' : 'Enter mapping values to preview synced issues.'}
              </div>
              </div>
            </details>
          )}

          <div className="order-6 grid grid-cols-3 overflow-hidden rounded-md border border-black/[0.08] bg-white text-center">
            <NumberMetric label="Estimated" value={activity.estimatedHours} suffix="h" disabled={!canEdit} onSave={(estimatedHours) => savePatch({ estimatedHours }, { estimatedHours: activity.estimatedHours })} />
            <NumberMetric label="Actual" value={activity.actualHours} suffix="h" disabled={!canEdit} onSave={(actualHours) => savePatch({ actualHours }, { actualHours: activity.actualHours })} />
            <NumberMetric label="Est. Cost" value={activity.estimatedCost} disabled={!canEdit} onSave={(estimatedCost) => savePatch({ estimatedCost }, { estimatedCost: activity.estimatedCost })} />
            <NumberMetric label="Act. Cost" value={activity.actualCost} disabled={!canEdit} onSave={(actualCost) => savePatch({ actualCost }, { actualCost: activity.actualCost })} />
            <SelectMetric label="Priority" value={activity.priority ?? ''} values={PRIORITIES} disabled={!canEdit} onSave={(priority) => savePatch({ priority: priority || null }, { priority: activity.priority })} />
            <SelectMetric label="Risk" value={activity.risk ?? ''} values={RISK_LEVELS} disabled={!canEdit} onSave={(risk) => savePatch({ risk: risk || null }, { risk: activity.risk })} />
          </div>

          <div className="order-8 flex items-center gap-2 pt-1 text-[14px] font-semibold text-ink-primary">
            <ListChecks className="size-4 text-primary-500" /> Details
          </div>

          <details className="group order-[11] overflow-hidden rounded-md border border-black/[0.08] bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-ink-primary hover:bg-surface-hover">
              <ChevronRight className="size-3.5 text-ink-tertiary transition-transform group-open:rotate-90" />
              <Link2 className="size-3.5 text-primary-500" /> Dependencies
              <span className="ml-auto text-[11px] font-normal text-ink-tertiary">{incomingDependencies.length + outgoingDependencies.length}</span>
            </summary>
            <div className="border-t border-black/[0.08] p-3">
            <div className="space-y-2">
              {incomingDependencies.map((dependency) => (
                <div key={dependency.id} className="flex items-center gap-2 rounded-md bg-surface-muted/50 px-3 py-2 text-body-sm">
                  <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">Predecessor</span>
                  <span className="min-w-0 flex-1 truncate text-ink-primary">{activityTitleById.get(dependency.predecessorId) ?? 'Activity'}</span>
                  <span className="text-[11px] text-ink-tertiary">{dependency.type}{dependency.lagDays ? ` ${dependency.lagDays > 0 ? '+' : ''}${dependency.lagDays}d` : ''}</span>
                  {canEdit && <button className="rounded p-1 text-ink-tertiary hover:bg-danger-50 hover:text-danger-600" onClick={() => deleteDependency.mutate({ dependencyId: dependency.id })} aria-label="Remove dependency"><X className="size-3.5" /></button>}
                </div>
              ))}
              {outgoingDependencies.map((dependency) => (
                <div key={dependency.id} className="flex items-center gap-2 rounded-md bg-surface-muted/50 px-3 py-2 text-body-sm">
                  <span className="rounded bg-success-50 px-1.5 py-0.5 text-[11px] font-medium text-success-700">Successor</span>
                  <span className="min-w-0 flex-1 truncate text-ink-primary">{activityTitleById.get(dependency.successorId) ?? 'Activity'}</span>
                  <span className="text-[11px] text-ink-tertiary">{dependency.type}{dependency.lagDays ? ` ${dependency.lagDays > 0 ? '+' : ''}${dependency.lagDays}d` : ''}</span>
                  {canEdit && <button className="rounded p-1 text-ink-tertiary hover:bg-danger-50 hover:text-danger-600" onClick={() => deleteDependency.mutate({ dependencyId: dependency.id })} aria-label="Remove dependency"><X className="size-3.5" /></button>}
                </div>
              ))}
              {incomingDependencies.length + outgoingDependencies.length === 0 && <div className="text-body-sm text-ink-tertiary">No dependencies linked.</div>}
            </div>
            {canEdit && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                <select className="input h-9" value={predecessorId} onChange={(event) => setPredecessorId(event.target.value)}>
                  <option value="">Select predecessor...</option>
                  {availablePredecessors.map((item) => <option key={item.id} value={item.id}>{item.phase} · {item.title}</option>)}
                </select>
                <select className="input h-9" value={dependencyType} onChange={(event) => setDependencyType(event.target.value as DependencyType)}>
                  {(['FS', 'SS', 'FF', 'SF'] as const).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={!predecessorId || createDependency.isPending}
                  onClick={async () => {
                    await createDependency.mutateAsync({ predecessorId, successorId: activity.id, type: dependencyType })
                    setPredecessorId('')
                  }}
                >
                  <Plus className="mr-1 size-3.5" /> Link
                </button>
              </div>
            )}
            </div>
          </details>

          {activity.status === 'APPROVAL_REQUESTED' && activity.waitingSince && (
            <div className={cn('order-7 rounded-md border px-3 py-2', daysOverSla > 0 ? 'border-danger-500/30 bg-danger-50 text-danger-700' : 'border-warning-500/30 bg-warning-50 text-warning-700')}>
              <div className="text-body-sm font-semibold">Awaiting client approval - {waitingDays} business days</div>
              <div className="text-[12px]">SLA: {APPROVAL_SLA_DAYS} days{daysOverSla > 0 ? ` - breached by ${daysOverSla} days` : ''}</div>
            </div>
          )}

          <div className="order-7">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-primary"><ListChecks className="size-4 text-primary-500" /> Subtasks</div>
              <span className="text-body-sm text-ink-tertiary">{ctx.subtasks.length}</span>
            </div>
            <div className="space-y-2">
              {ctx.subtasks.length === 0 ? (
                <div className="text-body-sm text-ink-tertiary">No subtasks.</div>
              ) : ctx.subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center justify-between border-b border-black/[0.06] bg-white px-2 py-1.5 last:border-0">
                  <span className="truncate text-body-sm text-ink-primary">{subtask.title}</span>
                  <span className="text-[11px] text-ink-tertiary">{Math.round(subtask.percentComplete)}%</span>
                </div>
              ))}
            </div>
            {canEdit && !activity.parentActivityId && (
              <div className="mt-3 flex gap-2">
                <input className="input h-9 flex-1" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="New subtask" />
                <button className="btn btn-outline btn-sm" disabled={!subtaskTitle.trim() || addActivity.isPending} onClick={() => void addSubtask()}>
                  <Plus className="mr-1 size-3.5" /> Add
                </button>
              </div>
            )}
          </div>

          <div className="order-[13] rounded-md border border-black/[0.08] bg-white p-3">
            <div className="mb-3 flex items-center gap-2 text-body font-medium text-ink-primary">
              <Paperclip className="size-4 text-primary-500" /> Files
              <span className="ml-auto text-body-sm font-normal text-ink-tertiary">{activityAttachments.data?.length ?? 0}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (file) await uploadAttachment.mutateAsync(file)
                event.target.value = ''
              }}
            />
            <div className="space-y-2">
              {activityAttachments.isLoading ? <div className="text-body-sm text-ink-tertiary">Loading files...</div> : activityAttachments.data?.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded-md bg-surface-muted/50 px-3 py-2 text-body-sm">
                  <Paperclip className="size-3.5 text-ink-tertiary" />
                  <a className="min-w-0 flex-1 truncate font-medium text-primary-700 hover:underline" href={attachment.storagePath} target="_blank" rel="noreferrer">{attachment.fileName}</a>
                  <span className="text-[11px] text-ink-tertiary">{formatBytes(attachment.fileSize)}</span>
                  {canEdit && <button className="rounded p-1 text-ink-tertiary hover:bg-danger-50 hover:text-danger-600" onClick={() => deleteAttachment.mutate({ attachmentId: attachment.id })} aria-label={`Delete ${attachment.fileName}`}><Trash2 className="size-3.5" /></button>}
                </div>
              ))}
              {!activityAttachments.isLoading && !activityAttachments.data?.length && <div className="text-body-sm text-ink-tertiary">No files attached.</div>}
            </div>
            {canEdit && (
              <button className="btn btn-outline btn-sm mt-3" disabled={uploadAttachment.isPending} onClick={() => fileInputRef.current?.click()}>
                <Plus className="mr-1 size-3.5" /> {uploadAttachment.isPending ? 'Uploading...' : 'Add file'}
              </button>
            )}
          </div>

          <div className="order-[14] rounded-md border border-black/[0.08] bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-body font-medium text-ink-primary">
              <MessageSquare className="size-4" /> Comments
              <span className="ml-auto text-body-sm font-normal text-ink-tertiary">{activityComments.data?.length ?? activity._count.comments}</span>
            </div>
            <div className="mb-3 space-y-2">
              {activityComments.isLoading ? (
                <div className="rounded-md bg-surface-muted/50 px-3 py-2 text-body-sm text-ink-tertiary">Loading comments...</div>
              ) : activityComments.data && activityComments.data.length > 0 ? (
                <div className="space-y-3">
                  {activityComments.data.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      canEdit={canEdit}
                      onReply={setReplyTo}
                      onVisibility={(commentId, visibility) => updateComment.mutate({ commentId, visibility })}
                      onDelete={(commentId) => deleteComment.mutate({ commentId })}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-md bg-surface-muted/50 px-3 py-2 text-body-sm text-ink-tertiary">No comments yet.</div>
              )}
            </div>
            {replyTo && (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-primary-500/20 bg-primary-50 px-2 py-1 text-body-sm text-primary-700">
                <Reply className="size-3.5" />
                Replying to {replyTo.author.name}
                <button className="ml-auto text-[12px] underline" onClick={() => setReplyTo(null)}>Cancel</button>
              </div>
            )}
            <div className="mb-2 flex gap-2">
              {(['INTERNAL', 'CLIENT_VISIBLE'] as const).map((visibility) => (
                <label key={visibility} className="flex items-center gap-1 rounded-md border border-black/[0.08] px-2 py-1 text-body-sm">
                  <input type="radio" checked={commentVisibility === visibility} onChange={() => setCommentVisibility(visibility)} />
                  {visibility === 'INTERNAL' ? 'Internal' : 'Client-visible'}
                </label>
              ))}
            </div>
            <MentionEditor
              value={commentHtml}
              onChange={setCommentHtml}
              users={users}
              minHeight={90}
              placeholder="Add a comment..."
              onSubmit={() => void submitComment()}
            />
            <div className="mt-2 flex justify-end">
              <button
                className="btn btn-primary btn-sm"
                disabled={addComment.isPending || !stripHtml(commentHtml)}
                onClick={() => void submitComment()}
              >
                <Send className="mr-1 size-3.5" /> Comment
              </button>
            </div>
          </div>

          <ConfirmDialog
            open={!!pendingDatePatch}
            onClose={() => setPendingDatePatch(null)}
            onConfirm={async () => {
              if (!pendingDatePatch || !slipReason) return
              await savePatch({
                ...pendingDatePatch.patch,
                slipReason,
                slipOwner,
                slipDetail: slipDetail.trim(),
              }, pendingDatePatch.undoPatch)
              setPendingDatePatch(null)
            }}
            title="Record Schedule Slip"
            message="This project is baselined. Date changes require a reason and owner before the activity can be saved."
            variant="warning"
            confirmLabel="Save Date Change"
            disabled={!slipReason || updateActivity.isPending}
            isLoading={updateActivity.isPending}
            extraContent={
              <div className="space-y-3">
                <label className="block">
                  <span className="text-body-sm text-ink-secondary">Reason</span>
                  <select
                    className="input mt-1 w-full"
                    value={slipReason}
                    onChange={(e) => {
                      const reason = e.target.value as SlipReason
                      setSlipReason(reason)
                      if (reason) setSlipOwner(SLIP_REASON_OWNER[reason])
                    }}
                  >
                    <option value="">Select reason</option>
                    {SLIP_REASONS.map((reason) => <option key={reason} value={reason}>{SLIP_REASON_LABEL[reason]}</option>)}
                  </select>
                </label>
                <div>
                  <div className="text-body-sm text-ink-secondary">Owner</div>
                  <div className="mt-1 flex gap-2">
                    {OWNER_PARTIES.map((owner) => (
                      <label key={owner} className="flex items-center gap-1 rounded-md border border-black/[0.08] px-2 py-1 text-body-sm">
                        <input type="radio" checked={slipOwner === owner} onChange={() => setSlipOwner(owner)} />
                        {owner === '360GROUND' ? '360Ground' : labelize(owner)}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="text-body-sm text-ink-secondary">Detail</span>
                  <textarea className="input mt-1 w-full" rows={2} value={slipDetail} onChange={(e) => setSlipDetail(e.target.value)} />
                </label>
              </div>
            }
          />

          <ConfirmDialog
            open={!!pendingGateOverride}
            onClose={() => setPendingGateOverride(null)}
            onConfirm={async () => {
              if (!pendingGateOverride || !gateOverrideReason.trim()) return
              await savePatch({
                ...pendingGateOverride.patch,
                gateOverrideReason: gateOverrideReason.trim(),
              }, pendingGateOverride.undoPatch)
              setPendingGateOverride(null)
              setGateOverrideReason('')
            }}
            title="Override Stage Gate"
            message={pendingGateOverride?.message ?? 'The previous phase gate has not passed. Proceed anyway?'}
            variant="warning"
            confirmLabel="Start Anyway"
            disabled={!gateOverrideReason.trim() || updateActivity.isPending}
            isLoading={updateActivity.isPending}
            extraContent={
              <label className="block">
                <span className="text-body-sm text-ink-secondary">Override reason *</span>
                <textarea className="input mt-1 w-full" rows={2} value={gateOverrideReason} onChange={(e) => setGateOverrideReason(e.target.value)} />
              </label>
            }
          />

          <ConfirmDialog
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            onConfirm={async () => {
              await deleteActivity.mutateAsync({ activityId: activity.id })
              setDeleteOpen(false)
              onClose()
            }}
            title="Delete Activity"
            message={`Delete "${activity.title}" from the schedule?`}
            variant="danger"
            confirmLabel="Delete"
            isLoading={deleteActivity.isPending}
          />
        </div>
      )}
    </SideDrawer>
  )
}

function CommentItem({
  comment,
  canEdit,
  depth = 0,
  onReply,
  onVisibility,
  onDelete,
}: {
  comment: ActivityCommentNode
  canEdit: boolean
  depth?: number
  onReply: (comment: ActivityCommentNode) => void
  onVisibility: (commentId: string, visibility: Visibility) => void
  onDelete: (commentId: string) => void
}) {
  return (
    <div className={cn(depth > 0 && 'ml-4 border-l border-black/[0.08] pl-3')}>
      <div className="rounded-md border border-black/[0.08] bg-surface-card p-2">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-body-sm font-medium text-ink-primary">{comment.author.name}</span>
          {comment.isClientAuthor && <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">Client</span>}
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', comment.visibility === 'CLIENT_VISIBLE' ? 'bg-success-50 text-success-700' : 'bg-surface-muted text-ink-secondary')}>
            {comment.visibility === 'CLIENT_VISIBLE' ? 'Client-visible' : 'Internal'}
          </span>
          <span className="ml-auto text-[11px] text-ink-tertiary">{formatDateTime(comment.createdAt)}</span>
        </div>
        <div
          className="prose prose-sm max-w-none text-body-sm text-ink-secondary [&_.mention]:font-medium [&_.mention]:text-primary-700"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.content) }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button className="text-[12px] font-medium text-primary-700 hover:underline" onClick={() => onReply(comment)}>
            Reply
          </button>
          {canEdit && (
            <>
              <select
                className="rounded-md border border-black/[0.08] bg-surface-card px-2 py-1 text-[12px]"
                value={comment.visibility}
                onChange={(e) => onVisibility(comment.id, e.target.value as Visibility)}
              >
                <option value="INTERNAL">Internal</option>
                <option value="CLIENT_VISIBLE">Client-visible</option>
              </select>
              <button className="text-[12px] font-medium text-danger-600 hover:underline" onClick={() => onDelete(comment.id)}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {comment.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              canEdit={canEdit}
              depth={depth + 1}
              onReply={onReply}
              onVisibility={onVisibility}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DateField({ label, value, disabled, onSave }: { label: string; value: string | null; disabled: boolean; onSave: (value: string | null) => void | Promise<void> }) {
  return (
    <div className="block">
      <span className="text-[10px] text-ink-tertiary">{label}</span>
      <ProjectDatePicker
        className="mt-0.5 h-8 border-transparent bg-transparent px-1 text-[11px] hover:border-black/[0.1]"
        value={dateOnly(value)}
        disabled={disabled}
        ariaLabel={`${label} date`}
        displayFormat="dd MMM yyyy"
        onChange={(nextValue) => {
          const next = nextValue || null
          if (next !== dateOnly(value)) void onSave(next)
        }}
      />
    </div>
  )
}

function NumberMetric({ label, value, suffix = '', disabled, onSave }: { label: string; value: number | null; suffix?: string; disabled: boolean; onSave: (value: number | null) => void | Promise<void> }) {
  return (
    <label className="border-b border-r border-black/[0.08] px-2 py-2.5">
      <div className="text-[10px] font-medium uppercase text-ink-tertiary">{label}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1">
        <input
          type="number"
          min={0}
          disabled={disabled}
          defaultValue={value ?? ''}
          className="h-7 w-16 rounded border border-transparent bg-transparent px-1 text-center text-[13px] font-medium text-ink-primary outline-none hover:border-black/[0.1] focus:border-primary-400"
          onBlur={(e) => {
            const next = e.target.value === '' ? null : Number(e.target.value)
            if (next !== value) void onSave(next)
          }}
        />
        {suffix && <span className="text-[11px] text-ink-tertiary">{suffix}</span>}
      </div>
    </label>
  )
}

function SelectMetric({ label, value, values, disabled, onSave }: { label: string; value: string; values: readonly string[]; disabled: boolean; onSave: (value: string) => void | Promise<void> }) {
  return (
    <label className="border-b border-r border-black/[0.08] px-2 py-2.5 text-left">
      <span className="text-[10px] font-medium uppercase text-ink-tertiary">{label}</span>
      <select className="mt-0.5 h-7 w-full rounded border border-transparent bg-transparent px-1 text-center text-[12px] font-medium outline-none hover:border-black/[0.1] focus:border-primary-400" value={value} disabled={disabled} onChange={(e) => void onSave(e.target.value)}>
        <option value="">-</option>
        {values.map((v) => <option key={v} value={v}>{labelize(v)}</option>)}
      </select>
    </label>
  )
}

function findActivityContext(project: ProjectDetail, activityId: string): ActivityContext | null {
  for (const phase of project.phases) {
    for (const milestone of phase.milestones) {
      const activity = milestone.activities.find((a) => a.id === activityId)
      if (activity) {
        return {
          activity,
          milestone,
          phase,
          siblings: milestone.activities
            .filter((a) => a.parentActivityId === activity.parentActivityId)
            .sort((a, b) => a.position - b.position),
          subtasks: milestone.activities
            .filter((a) => a.parentActivityId === activity.id)
            .sort((a, b) => a.position - b.position),
        }
      }
    }
  }
  return null
}

function previousIndentTarget(activity: ActivityNode, siblings: ActivityNode[]): ActivityNode | null {
  const index = siblings.findIndex((s) => s.id === activity.id)
  if (index <= 0) return null
  return siblings[index - 1]
}

function dateOnly(value: string | null): string {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function calendarDayCount(start: string | null, end: string | null): number | null {
  if (!start || !end) return null
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startUtc = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  const endUtc = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  return endUtc < startUtc ? null : Math.floor((endUtc - startUtc) / 86_400_000) + 1
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function splitCsv(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter(Boolean)
}

function buildClientJiraMappingKeys(type: JiraMappingType, values: readonly string[]): string[] {
  if (type === 'MANUAL') return values.map((value) => value.toUpperCase())
  return values.map((value) => `${type}:${type === 'LABEL' || type === 'COMPONENT' ? value : value.toUpperCase()}`)
}

function parseClientJiraMapping(keys: readonly string[]): { type: JiraMappingType; values: string[] } {
  const token = keys.find((key) => key.includes(':'))
  if (!token) return { type: 'MANUAL', values: [...keys] }
  const rawType = token.split(':', 1)[0]
  const type = isClientJiraMappingType(rawType) ? rawType : 'MANUAL'
  if (type === 'MANUAL') return { type, values: [...keys] }
  return {
    type,
    values: keys.filter((key) => key.startsWith(`${type}:`)).map((key) => key.slice(type.length + 1)),
  }
}

function isClientJiraMappingType(value: string): value is JiraMappingType {
  return value === 'MANUAL' || value === 'EPIC' || value === 'LABEL' || value === 'COMPONENT' || value === 'SPRINT'
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}
