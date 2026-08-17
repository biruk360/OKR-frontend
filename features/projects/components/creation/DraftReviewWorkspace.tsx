'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarRange,
  Check,
  ChevronLeft,
  Copy,
  Download,
  FileText,
  GitBranch,
  ListChecks,
  PackageCheck,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import CustomerLookup from '@/components/customers/CustomerLookup'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useDepartments } from '@/hooks/useDepartments'
import { cn } from '@/lib/utils'
import {
  combineNormalizedProjectCreationDraft,
  createEmptyProjectCreationScheduleJson,
  createEmptyProjectCreationValidationJson,
  normalizedProjectCreationDraftSchema,
  type NormalizedProjectCreationDraft,
} from '@/lib/projects/creation-normalize'
import {
  createProjectCreationDraftWorkbook,
  movePositionedItem,
  renumberPositions,
} from '@/lib/projects/creation-review'
import { wouldCreateDependencyCycle } from '@/lib/projects/scheduling'
import { projectCreationClientCommitBlockers } from '@/lib/projects/creation-commit-shared'
import { decideProjectCreationCleanupChanges } from '@/lib/projects/creation-changes'
import {
  useCommitProjectCreationDraft,
  useUpdateProjectCreationDraft,
  type ProjectCreationDraftNode,
} from '../../hooks/useProjects'
import type { CommitProjectCreationDraftResult } from '@/lib/projects/creation-commit-shared'
import { CommitConfirmDialog } from './CommitConfirmDialog'
import { ChangeListPanel } from './ChangeListPanel'

type PanelId = 'project' | 'schedule' | 'deliverables' | 'dependencies' | 'assumptions' | 'validation' | 'sources'
type ReviewFilter = 'ALL' | 'ERRORS' | 'WARNINGS' | 'ASSUMPTIONS' | 'AI'
// react-hook-form's recursive FieldPath expansion cannot represent the schema's
// intentionally recursive JSON change values. The Zod parse at every save/export
// remains the authoritative full-schema boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReviewFormDraft = Record<string, any>

interface DraftReviewWorkspaceProps {
  draft: ProjectCreationDraftNode
  onDraftUpdated: (draft: ProjectCreationDraftNode) => void
  onSaveExit: () => void
  onBack?: () => void
  onRestartSource?: () => void
  onCommitted?: (project: CommitProjectCreationDraftResult) => Promise<void> | void
  footerAction?: React.ReactNode
}

const PANELS: Array<{ id: PanelId; label: string; icon: typeof FileText }> = [
  { id: 'project', label: 'Project Details', icon: FileText },
  { id: 'schedule', label: 'Schedule', icon: CalendarRange },
  { id: 'deliverables', label: 'Deliverables', icon: PackageCheck },
  { id: 'dependencies', label: 'Dependencies', icon: GitBranch },
  { id: 'assumptions', label: 'Assumptions & Questions', icon: Sparkles },
  { id: 'validation', label: 'Validation', icon: ListChecks },
  { id: 'sources', label: 'Source & Changes', icon: FileText },
]

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'ERRORS', label: 'Errors' },
  { id: 'WARNINGS', label: 'Warnings' },
  { id: 'ASSUMPTIONS', label: 'Assumptions' },
  { id: 'AI', label: 'AI suggestions' },
]

function cloneDraft(value: NormalizedProjectCreationDraft): NormalizedProjectCreationDraft {
  return structuredClone(value)
}

function newId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`
}

function toReviewDraft(draft: ProjectCreationDraftNode): NormalizedProjectCreationDraft {
  return combineNormalizedProjectCreationDraft(
    draft.projectJson,
    draft.scheduleJson ?? createEmptyProjectCreationScheduleJson(),
    draft.validationJson ?? createEmptyProjectCreationValidationJson(),
  )
}

function pathMatches(paths: readonly string[], kind: string, index: number, id: string) {
  return paths.some((path) => path.includes(`${kind}.${index}`) || path.includes(id))
}

const emptyToNull = (value: unknown) => value === '' ? null : value

export function DraftReviewWorkspace({
  draft,
  onDraftUpdated,
  onSaveExit,
  onBack,
  onRestartSource,
  onCommitted,
  footerAction,
}: DraftReviewWorkspaceProps) {
  const initial = useMemo(() => toReviewDraft(draft), [draft.id])
  const openSnapshot = useRef(cloneDraft(initial))
  const history = useRef<NormalizedProjectCreationDraft[]>([cloneDraft(initial)])
  const historyIndex = useRef(0)
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSerialized = useRef(JSON.stringify(initial))
  const [historyVersion, setHistoryVersion] = useState(0)
  const [panel, setPanel] = useState<PanelId>('project')
  const [filter, setFilter] = useState<ReviewFilter>('ALL')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitSnapshot, setCommitSnapshot] = useState<NormalizedProjectCreationDraft | null>(null)
  const [commitVersion, setCommitVersion] = useState<number | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; action: () => void }>(null)
  const updateDraft = useUpdateProjectCreationDraft(draft.id)
  const commitDraft = useCommitProjectCreationDraft(draft.id)
  const { users } = useUsersForSelection({ enabled: true })
  const { departments } = useDepartments({ enabled: true })
  const {
    control,
    register,
    reset,
    getValues,
    watch,
    setValue,
  } = useForm<ReviewFormDraft>({ defaultValues: initial as unknown as ReviewFormDraft })
  const values = watch() as unknown as NormalizedProjectCreationDraft
  const knownCommitBlockers = projectCreationClientCommitBlockers(
    values,
    draft.sourceMethod,
  )

  useEffect(() => () => {
    if (historyTimer.current) clearTimeout(historyTimer.current)
  }, [])

  const pushHistory = (next: NormalizedProjectCreationDraft) => {
    const serialized = JSON.stringify(next)
    if (serialized === lastSerialized.current) return
    history.current = history.current.slice(0, historyIndex.current + 1)
    history.current.push(cloneDraft(next))
    if (history.current.length > 75) history.current.shift()
    historyIndex.current = history.current.length - 1
    lastSerialized.current = serialized
    setHistoryVersion((value) => value + 1)
  }

  const queueHistory = () => {
    if (historyTimer.current) clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(() => pushHistory(getValues() as unknown as NormalizedProjectCreationDraft), 250)
  }

  const mutate = (callback: (next: NormalizedProjectCreationDraft) => void) => {
    if (historyTimer.current) clearTimeout(historyTimer.current)
    const next = cloneDraft(getValues() as unknown as NormalizedProjectCreationDraft)
    callback(next)
    reset(next as unknown as ReviewFormDraft)
    pushHistory(next)
  }

  const travel = (direction: -1 | 1) => {
    if (historyTimer.current) clearTimeout(historyTimer.current)
    const target = historyIndex.current + direction
    if (target < 0 || target >= history.current.length) return
    historyIndex.current = target
    const next = cloneDraft(history.current[target])
    reset(next as unknown as ReviewFormDraft)
    lastSerialized.current = JSON.stringify(next)
    setHistoryVersion((value) => value + 1)
  }

  const parseCurrent = () => {
    const parsed = normalizedProjectCreationDraftSchema.safeParse(getValues())
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setSaveError(`${first.path.join('.') || 'Draft'}: ${first.message}`)
      setPanel(first.path[0] === 'project' ? 'project' : 'schedule')
      return null
    }
    setSaveError(null)
    return parsed.data
  }

  const persist = async (normalized: NormalizedProjectCreationDraft) => {
    const updated = await updateDraft.mutateAsync({
      version: draft.version,
      projectJson: { schemaVersion: normalized.schemaVersion, project: normalized.project },
      scheduleJson: {
        schemaVersion: normalized.schemaVersion,
        phases: normalized.phases,
        milestones: normalized.milestones,
        activities: normalized.activities,
        dependencies: normalized.dependencies,
        deliverables: normalized.deliverables,
        sources: normalized.sources,
        changes: normalized.changes,
      },
      validationJson: {
        schemaVersion: normalized.schemaVersion,
        assumptions: normalized.assumptions,
        questions: normalized.questions,
        warnings: normalized.warnings,
        issues: normalized.issues,
      },
    })
    onDraftUpdated(updated)
    return updated
  }

  const save = async (exit: boolean) => {
    const normalized = parseCurrent()
    if (!normalized) return
    try {
      await persist(normalized)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The draft could not be saved.')
      return
    }
    toast.success('Draft saved')
    if (exit) onSaveExit()
  }

  const prepareCommit = async () => {
    const normalized = parseCurrent()
    if (!normalized) return
    const blockers = projectCreationClientCommitBlockers(normalized, draft.sourceMethod)
    if (blockers.length > 0) {
      setSaveError(blockers[0])
      setPanel('validation')
      return
    }
    try {
      const updated = await persist(normalized)
      setCommitSnapshot(normalized)
      setCommitVersion(updated.version)
      setCommitError(null)
      setCommitOpen(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The draft could not be saved before creation.')
    }
  }

  const confirmCommit = async () => {
    if (commitVersion === null) return
    setCommitError(null)
    try {
      const project = await commitDraft.mutateAsync({ version: commitVersion })
      setCommitOpen(false)
      await onCommitted?.(project)
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : 'The project could not be created. The draft was preserved.')
    }
  }

  const downloadWorkbook = () => {
    const normalized = parseCurrent()
    if (!normalized) return
    const workbook = createProjectCreationDraftWorkbook(normalized, draft.id)
    const bytes = workbook.bytes.buffer.slice(
      workbook.bytes.byteOffset,
      workbook.bytes.byteOffset + workbook.bytes.byteLength,
    ) as ArrayBuffer
    const url = URL.createObjectURL(new Blob([bytes], { type: workbook.contentType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = workbook.filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const activityFilterMatches = (activityIndex: number, activityId: string) => {
    if (filter === 'ALL') return true
    if (filter === 'ERRORS') return values.issues.some((item) => item.severity === 'BLOCKING' && pathMatches(item.affectedPaths, 'activities', activityIndex, activityId))
    if (filter === 'WARNINGS') return values.issues.some((item) => item.severity !== 'BLOCKING' && pathMatches(item.affectedPaths, 'activities', activityIndex, activityId))
      || values.warnings.some((item) => pathMatches(item.affectedPaths, 'activities', activityIndex, activityId))
    if (filter === 'ASSUMPTIONS') return values.assumptions.some((item) => pathMatches(item.affectedPaths, 'activities', activityIndex, activityId))
    return values.sources.some((item) => item.lastEditor === 'AI' && pathMatches(item.targetPaths, 'activities', activityIndex, activityId))
      || values.changes.some((item) => item.status === 'PROPOSED' && pathMatches([item.path], 'activities', activityIndex, activityId))
  }

  const requestDelete = (title: string, message: string, action: () => void) => {
    setConfirm({ title, message, label: 'Delete', action })
  }

  return (
    <div className="space-y-4" onChange={queueHistory}>
      <div className="rounded-card border border-border bg-surface-card p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-section-title text-ink-primary">Review and control the draft</h3>
            <p className="mt-1 text-body-sm text-ink-secondary">Every proposed project, schedule, deliverable, and dependency value remains editable. Saving changes only this private draft.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" aria-label="Undo last draft edit" disabled={historyIndex.current === 0} onClick={() => travel(-1)}>
              <Undo2 data-icon="inline-start" /> Undo
            </Button>
            <Button type="button" size="sm" variant="outline" aria-label="Redo last draft edit" disabled={historyIndex.current >= history.current.length - 1} onClick={() => travel(1)}>
              <Redo2 data-icon="inline-start" /> Redo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={downloadWorkbook}>
              <Download data-icon="inline-start" /> Download XLSX
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Review filters">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={cn('rounded-pill px-3 py-1.5 text-body-sm font-medium transition-colors', filter === item.id ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-ink-secondary hover:bg-surface-hover')}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Draft review panels" className="h-fit rounded-card border border-border bg-surface-card p-2 shadow-card">
          {PANELS.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} type="button" onClick={() => setPanel(item.id)} className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-body-sm transition-colors', panel === item.id ? 'bg-primary/10 font-semibold text-primary' : 'text-ink-secondary hover:bg-surface-hover')}>
                <Icon className="size-4" strokeWidth={1.75} /> {item.label}
              </button>
            )
          })}
        </nav>

        <section className="min-w-0 rounded-card border border-border bg-surface-card p-5 shadow-card">
          {panel === 'project' && <ProjectPanel control={control} register={register} values={values} setValue={setValue} users={users} departments={departments} />}
          {panel === 'schedule' && <SchedulePanel values={values} control={control} register={register} filterMatches={activityFilterMatches} mutate={mutate} requestDelete={requestDelete} users={users} />}
          {panel === 'deliverables' && <DeliverablesPanel values={values} register={register} mutate={mutate} requestDelete={requestDelete} />}
          {panel === 'dependencies' && <DependenciesPanel values={values} register={register} mutate={mutate} requestDelete={requestDelete} />}
          {panel === 'assumptions' && <AssumptionsPanel values={values} register={register} mutate={mutate} requestDelete={requestDelete} />}
          {panel === 'validation' && <ValidationPanel values={values} register={register} setPanel={setPanel} />}
          {panel === 'sources' && <SourcesPanel values={values} register={register} mutate={mutate} requestDelete={requestDelete} />}
        </section>
      </div>

      {saveError && <p role="alert" className="rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-body-sm text-danger-700">{saveError}</p>}
      {onCommitted && knownCommitBlockers.length > 0 && (
        <button type="button" onClick={() => setPanel('validation')} className="w-full rounded-card border border-danger-500/30 bg-danger-50 px-4 py-3 text-left text-body-sm text-danger-700">
          <span className="font-semibold">Create Project is disabled.</span> {knownCommitBlockers[0]} Open Validation to review the saved findings.
        </button>
      )}

      <div className="flex flex-col-reverse gap-3 rounded-card border border-border bg-surface-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {onBack && <Button type="button" variant="ghost" onClick={onBack}><ChevronLeft data-icon="inline-start" /> Back</Button>}
          {onRestartSource && (
            <Button type="button" variant="outline" onClick={() => setConfirm({
              title: 'Restart from the original source?',
              message: 'Your saved draft version is retained. You can return to the source step and create a newer version after reviewing the source again.',
              label: 'Restart from source',
              action: onRestartSource,
            })}>
              <RefreshCw data-icon="inline-start" /> Restart from source
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setConfirm({
            title: 'Restore the review-open version?',
            message: 'This restores the values that were present when review opened. Save afterward to retain the restoration as a new draft version.',
            label: 'Restore version',
            action: () => mutate((next) => Object.assign(next, cloneDraft(openSnapshot.current))),
          })}>
            Restore open version
          </Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={updateDraft.isPending} onClick={() => void save(true)}>
            <Save data-icon="inline-start" /> {updateDraft.isPending ? 'Saving…' : 'Save and exit'}
          </Button>
          <Button type="button" disabled={updateDraft.isPending} onClick={() => void save(false)}>
            <Check data-icon="inline-start" /> {updateDraft.isPending ? 'Saving…' : 'Save draft'}
          </Button>
          {onCommitted && (
            <Button type="button" disabled={updateDraft.isPending || commitDraft.isPending || knownCommitBlockers.length > 0} onClick={() => void prepareCommit()}>
              <Check data-icon="inline-start" /> Create Project
            </Button>
          )}
          {footerAction}
        </div>
      </div>

      <span className="sr-only" aria-live="polite">History state {historyVersion}</span>
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action()
          setConfirm(null)
        }}
        title={confirm?.title ?? 'Confirm action'}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label ?? 'Confirm'}
        variant={confirm?.label === 'Delete' ? 'danger' : 'warning'}
      />
      {commitSnapshot && (
        <CommitConfirmDialog
          open={commitOpen}
          draft={commitSnapshot}
          projectManagerLabel={users.find((user) => user.id === commitSnapshot.project.projectManagerId)?.name
            ?? users.find((user) => user.id === commitSnapshot.project.projectManagerId)?.email
            ?? 'Selected project manager'}
          isPending={commitDraft.isPending}
          error={commitError}
          onClose={() => { if (!commitDraft.isPending) setCommitOpen(false) }}
          onConfirm={confirmCommit}
        />
      )}
    </div>
  )
}

type Register = UseFormRegister<ReviewFormDraft>

function ProjectPanel({ control, register, values, setValue, users, departments }: {
  control: Control<ReviewFormDraft>
  register: Register
  values: NormalizedProjectCreationDraft
  setValue: UseFormSetValue<ReviewFormDraft>
  users: Array<{ id: string; name?: string | null; email: string }>
  departments: Array<{ id: string; name: string }>
}) {
  const project = values.project
  return (
    <div className="space-y-5">
      <PanelHeading title="Project Details" description="Edit the project identity, outcome, scope, dates, ownership, and working calendar." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name"><input className="input" {...register('project.name', { setValueAs: emptyToNull })} /></Field>
        <Field label="Project code"><input className="input" {...register('project.code', { setValueAs: emptyToNull })} /></Field>
        <Field label="Client">
          <Controller name="project.clientName" control={control} render={({ field }) => <CustomerLookup value={{ odooPartnerId: project.clientId, customerName: field.value ?? '' }} onChange={(customer) => { setValue('project.clientId', customer.odooPartnerId, { shouldDirty: true }); field.onChange(customer.customerName || null) }} />} />
        </Field>
        <Field label="Project type"><input className="input" {...register('project.projectType', { setValueAs: emptyToNull })} /></Field>
        <Field label="Other project type"><input className="input" {...register('project.projectTypeOther', { setValueAs: emptyToNull })} /></Field>
        <Field label="Project manager"><Controller name="project.projectManagerId" control={control} render={({ field }) => <select className="input" value={field.value ?? ''} onChange={(event) => field.onChange(emptyToNull(event.target.value))}><option value="">Choose a project manager</option>{field.value && !users.some((user) => user.id === field.value) && <option value={field.value}>Saved project manager</option>}{users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}</select>} /></Field>
        <Field label="Department"><Controller name="project.departmentId" control={control} render={({ field }) => <select className="input" value={field.value ?? ''} onChange={(event) => field.onChange(emptyToNull(event.target.value))}><option value="">None</option>{field.value && !departments.some((department) => department.id === field.value) && <option value={field.value}>Saved department</option>}{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>} /></Field>
        <Field label="Contract value"><NullableNumber value={project.contractValue} onChange={(value) => setValue('project.contractValue', value, { shouldDirty: true })} /></Field>
        <Field label="Currency"><select className="input" {...register('project.currency')}><option>ETB</option><option>USD</option><option>EUR</option></select></Field>
        <Field label="Planned start"><input type="date" className="input" {...register('project.plannedStart', { setValueAs: emptyToNull })} /></Field>
        <Field label="Planned end"><input type="date" className="input" {...register('project.plannedEnd', { setValueAs: emptyToNull })} /></Field>
      </div>
      <Field label="Description"><textarea rows={3} className="input" {...register('project.description', { setValueAs: emptyToNull })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Objective"><textarea rows={3} className="input" {...register('project.objective', { setValueAs: emptyToNull })} /></Field>
        <Field label="Business outcome"><textarea rows={3} className="input" {...register('project.businessOutcome', { setValueAs: emptyToNull })} /></Field>
        <Field label="Scope included"><Controller name="project.scopeIncluded" control={control} render={({ field }) => <textarea rows={4} className="input" value={field.value.join('\n')} onChange={(event) => field.onChange(event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} />} /></Field>
        <Field label="Scope excluded"><Controller name="project.scopeExcluded" control={control} render={({ field }) => <textarea rows={4} className="input" value={field.value.join('\n')} onChange={(event) => field.onChange(event.target.value.split('\n').map((item) => item.trim()).filter(Boolean))} />} /></Field>
      </div>
      <div className="rounded-card bg-surface-muted p-4">
        <h4 className="text-body font-semibold text-ink-primary">Working calendar</h4>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Calendar mode"><select className="input" {...register('project.workingCalendar.mode')}><option value="ORGANIZATION">Organization</option><option value="WEEKDAYS">Weekdays</option><option value="CUSTOM">Custom</option></select></Field>
          <Field label="Timezone"><input className="input" placeholder="Africa/Addis_Ababa" {...register('project.workingCalendar.timezone', { setValueAs: emptyToNull })} /></Field>
          <Field label="Non-working dates"><Controller name="project.workingCalendar.nonWorkingDates" control={control} render={({ field }) => <input className="input" value={field.value.join(', ')} onChange={(event) => field.onChange(event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} />} /></Field>
          <label className="flex items-center gap-2 text-body-sm text-ink-primary"><input type="checkbox" {...register('project.workingCalendar.allowNonWorkingDates')} /> Allow tasks on non-working dates</label>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const).map((day) => <label key={day} className="flex items-center gap-1.5 text-body-sm text-ink-secondary"><input type="checkbox" value={day} {...register('project.workingCalendar.workingDays')} /> {day}</label>)}
        </div>
      </div>
    </div>
  )
}

function SchedulePanel({ values, control, register, filterMatches, mutate, requestDelete, users }: {
  values: NormalizedProjectCreationDraft
  control: Control<ReviewFormDraft>
  register: Register
  filterMatches: (index: number, id: string) => boolean
  mutate: (callback: (next: NormalizedProjectCreationDraft) => void) => void
  requestDelete: (title: string, message: string, action: () => void) => void
  users: Array<{ id: string; name?: string | null; email: string }>
}) {
  const visibleActivities = values.activities.map((item, index) => ({ item, index })).filter(({ item, index }) => filterMatches(index, item.id))
  const addPhase = () => mutate((next) => next.phases.push({ id: newId('phase'), name: 'New phase', position: next.phases.length, weight: 0, plannedStart: null, plannedEnd: null }))
  const addMilestone = (phaseId: string) => mutate((next) => next.milestones.push({ id: newId('milestone'), phaseId, name: 'New milestone', position: next.milestones.filter((item) => item.phaseId === phaseId).length, weight: 0, isKeyMilestone: false, dueDate: null }))
  const addActivity = (milestoneId: string) => mutate((next) => next.activities.push({ id: newId('activity'), sourceRowId: null, milestoneId, parentActivityId: null, position: next.activities.filter((item) => item.milestoneId === milestoneId).length, title: 'New activity', description: null, ownerParty: '360GROUND', assigneeId: null, assigneeEmail: null, suggestedRole: null, startDate: null, endDate: null, weight: 0, estimatedHours: null, priority: null, risk: null, isBlocked: false, blockerDetails: null, isApproval: false }))

  const duplicatePhase = (phaseIndex: number) => mutate((next) => {
    const source = next.phases[phaseIndex]
    const phaseId = newId('phase')
    next.phases.splice(phaseIndex + 1, 0, { ...source, id: phaseId, name: `${source.name} copy` })
    const milestones = next.milestones.filter((item) => item.phaseId === source.id)
    milestones.forEach((milestone) => {
      const milestoneId = newId('milestone')
      next.milestones.push({ ...milestone, id: milestoneId, phaseId })
      next.activities.filter((activity) => activity.milestoneId === milestone.id).forEach((activity) => next.activities.push({ ...activity, id: newId('activity'), milestoneId, parentActivityId: null }))
    })
    next.phases = renumberPositions(next.phases)
  })

  const deletePhase = (phaseId: string) => mutate((next) => {
    const milestoneIds = new Set(next.milestones.filter((item) => item.phaseId === phaseId).map((item) => item.id))
    const activityIds = new Set(next.activities.filter((item) => milestoneIds.has(item.milestoneId)).map((item) => item.id))
    next.phases = renumberPositions(next.phases.filter((item) => item.id !== phaseId))
    next.milestones = next.milestones.filter((item) => !milestoneIds.has(item.id))
    next.activities = next.activities.filter((item) => !activityIds.has(item.id))
    next.dependencies = next.dependencies.filter((item) => !activityIds.has(item.predecessorActivityId) && !activityIds.has(item.successorActivityId))
    next.deliverables = next.deliverables.filter((item) => !milestoneIds.has(item.milestoneId))
  })

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3"><PanelHeading title="Schedule" description="Edit the hierarchy and compare dated activities in the Gantt preview." /><Button type="button" size="sm" onClick={addPhase}><Plus data-icon="inline-start" /> Add phase</Button></div>
      <DraftGantt activities={values.activities} />
      {values.phases.length === 0 ? <EmptyState bare icon={CalendarRange} title="No schedule yet" description="Start blank stays blank until you add a phase." action={{ label: 'Add Phase', onClick: addPhase }} /> : values.phases.map((phase, phaseIndex) => {
        const milestones = values.milestones.map((item, index) => ({ item, index })).filter(({ item }) => item.phaseId === phase.id)
        return (
          <div key={phase.id} className="rounded-card border border-border p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_7rem_9rem_9rem_auto]">
              <Field label="Phase name"><input className="input" {...register(`phases.${phaseIndex}.name`)} /></Field>
              <Field label="Weight"><input type="number" min={0} max={100} step="any" className="input" {...register(`phases.${phaseIndex}.weight`, { valueAsNumber: true })} /></Field>
              <Field label="Start"><input type="date" className="input" {...register(`phases.${phaseIndex}.plannedStart`, { setValueAs: emptyToNull })} /></Field>
              <Field label="End"><input type="date" className="input" {...register(`phases.${phaseIndex}.plannedEnd`, { setValueAs: emptyToNull })} /></Field>
              <RowActions onUp={() => mutate((next) => { next.phases = movePositionedItem(next.phases, phaseIndex, -1) })} onDown={() => mutate((next) => { next.phases = movePositionedItem(next.phases, phaseIndex, 1) })} onDuplicate={() => duplicatePhase(phaseIndex)} onDelete={() => requestDelete('Delete phase?', 'Its milestones, activities, dependencies, and deliverables will be removed from this draft.', () => deletePhase(phase.id))} />
            </div>
            <div className="mt-4 space-y-3 border-l-2 border-primary/20 pl-4">
              {milestones.map(({ item: milestone, index: milestoneIndex }) => (
                <div key={milestone.id} className="rounded-card bg-surface-muted p-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(10rem,1fr)_8rem_7rem_9rem_auto]">
                    <Field label="Milestone"><input className="input" {...register(`milestones.${milestoneIndex}.name`)} /></Field>
                    <Field label="Phase"><select className="input" {...register(`milestones.${milestoneIndex}.phaseId`)}>{values.phases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                    <Field label="Weight"><input type="number" min={0} max={100} step="any" className="input" {...register(`milestones.${milestoneIndex}.weight`, { valueAsNumber: true })} /></Field>
                    <Field label="Due date"><input type="date" className="input" {...register(`milestones.${milestoneIndex}.dueDate`, { setValueAs: emptyToNull })} /></Field>
                    <RowActions onUp={() => mutate((next) => { const group = next.milestones.filter((candidate) => candidate.phaseId === milestone.phaseId); const local = group.findIndex((candidate) => candidate.id === milestone.id); const moved = movePositionedItem(group, local, -1); next.milestones = next.milestones.map((candidate) => moved.find((entry) => entry.id === candidate.id) ?? candidate) })} onDown={() => mutate((next) => { const group = next.milestones.filter((candidate) => candidate.phaseId === milestone.phaseId); const local = group.findIndex((candidate) => candidate.id === milestone.id); const moved = movePositionedItem(group, local, 1); next.milestones = next.milestones.map((candidate) => moved.find((entry) => entry.id === candidate.id) ?? candidate) })} onDuplicate={() => mutate((next) => { const copyId = newId('milestone'); next.milestones.push({ ...next.milestones[milestoneIndex], id: copyId, name: `${milestone.name} copy`, position: next.milestones.filter((candidate) => candidate.phaseId === milestone.phaseId).length }); next.activities.filter((activity) => activity.milestoneId === milestone.id).forEach((activity) => next.activities.push({ ...activity, id: newId('activity'), milestoneId: copyId, parentActivityId: null })) })} onDelete={() => requestDelete('Delete milestone?', 'Its activities, dependencies, and deliverables will be removed from this draft.', () => mutate((next) => { const ids = new Set(next.activities.filter((activity) => activity.milestoneId === milestone.id).map((activity) => activity.id)); next.milestones = next.milestones.filter((candidate) => candidate.id !== milestone.id); next.activities = next.activities.filter((activity) => !ids.has(activity.id)); next.dependencies = next.dependencies.filter((dependency) => !ids.has(dependency.predecessorActivityId) && !ids.has(dependency.successorActivityId)); next.deliverables = next.deliverables.filter((deliverable) => deliverable.milestoneId !== milestone.id) }))} />
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-body-sm text-ink-secondary"><input type="checkbox" {...register(`milestones.${milestoneIndex}.isKeyMilestone`)} /> Key milestone</label>
                  <div className="mt-3 space-y-3">
                    {visibleActivities.filter(({ item }) => item.milestoneId === milestone.id).map(({ item: activity, index: activityIndex }) => (
                      <ActivityEditor key={activity.id} activity={activity} index={activityIndex} values={values} control={control} register={register} users={users} mutate={mutate} requestDelete={requestDelete} />
                    ))}
                    <Button type="button" size="sm" variant="outline" onClick={() => addActivity(milestone.id)}><Plus data-icon="inline-start" /> Add activity</Button>
                  </div>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => addMilestone(phase.id)}><Plus data-icon="inline-start" /> Add milestone</Button>
            </div>
          </div>
        )
      })}
      {values.activities.length > 0 && visibleActivities.length === 0 && <EmptyState bare icon={ListChecks} title="No activities match this filter" description="Choose All or resolve the selected review category." />}
    </div>
  )
}

function ActivityEditor({ activity, index, values, control, register, users, mutate, requestDelete }: {
  activity: NormalizedProjectCreationDraft['activities'][number]
  index: number
  values: NormalizedProjectCreationDraft
  control: Control<ReviewFormDraft>
  register: Register
  users: Array<{ id: string; name?: string | null; email: string }>
  mutate: (callback: (next: NormalizedProjectCreationDraft) => void) => void
  requestDelete: (title: string, message: string, action: () => void) => void
}) {
  const siblings = values.activities.filter((item) => item.milestoneId === activity.milestoneId)
  const localIndex = siblings.findIndex((item) => item.id === activity.id)
  return (
    <div className="rounded-card border border-border bg-surface-card p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_9rem_9rem_auto]">
        <Field label="Activity"><input className="input" {...register(`activities.${index}.title`)} /></Field>
        <Field label="Start"><input type="date" className="input" {...register(`activities.${index}.startDate`, { setValueAs: emptyToNull })} /></Field>
        <Field label="End"><input type="date" className="input" {...register(`activities.${index}.endDate`, { setValueAs: emptyToNull })} /></Field>
        <RowActions onUp={() => mutate((next) => { const group = next.activities.filter((item) => item.milestoneId === activity.milestoneId); const moved = movePositionedItem(group, localIndex, -1); next.activities = next.activities.map((item) => moved.find((entry) => entry.id === item.id) ?? item) })} onDown={() => mutate((next) => { const group = next.activities.filter((item) => item.milestoneId === activity.milestoneId); const moved = movePositionedItem(group, localIndex, 1); next.activities = next.activities.map((item) => moved.find((entry) => entry.id === item.id) ?? item) })} onDuplicate={() => mutate((next) => next.activities.push({ ...next.activities[index], id: newId('activity'), title: `${activity.title} copy`, position: siblings.length, parentActivityId: null }))} onDelete={() => requestDelete('Delete activity?', 'Its dependency links and deliverable references will also be removed from this draft.', () => mutate((next) => { next.activities = next.activities.filter((item) => item.id !== activity.id); next.dependencies = next.dependencies.filter((item) => item.predecessorActivityId !== activity.id && item.successorActivityId !== activity.id); next.deliverables = next.deliverables.map((item) => ({ ...item, producingActivityIds: item.producingActivityIds.filter((id) => id !== activity.id), approvalActivityId: item.approvalActivityId === activity.id ? null : item.approvalActivityId })) }))} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Milestone"><select className="input" {...register(`activities.${index}.milestoneId`)}>{values.milestones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Parent activity"><select className="input" {...register(`activities.${index}.parentActivityId`, { setValueAs: emptyToNull })}><option value="">None</option>{values.activities.filter((item) => item.id !== activity.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="Owner"><select className="input" {...register(`activities.${index}.ownerParty`)}><option value="360GROUND">360GROUND</option><option value="CLIENT">CLIENT</option><option value="SHARED">SHARED</option></select></Field>
        <Field label="Assignee"><Controller name={`activities.${index}.assigneeId`} control={control} render={({ field }) => <select className="input" value={field.value ?? ''} onChange={(event) => field.onChange(emptyToNull(event.target.value))}><option value="">Unassigned</option>{field.value && !users.some((user) => user.id === field.value) && <option value={field.value}>Saved assignee</option>}{users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}</select>} /></Field>
        <Field label="Assignee email"><input type="email" className="input" {...register(`activities.${index}.assigneeEmail`, { setValueAs: emptyToNull })} /></Field>
        <Field label="Suggested role"><input className="input" {...register(`activities.${index}.suggestedRole`, { setValueAs: emptyToNull })} /></Field>
        <Field label="Weight"><input type="number" min={0} max={100} step="any" className="input" {...register(`activities.${index}.weight`, { valueAsNumber: true })} /></Field>
        <Field label="Estimated hours"><input type="number" min={0} step="any" className="input" {...register(`activities.${index}.estimatedHours`, { setValueAs: (value) => value === '' ? null : Number(value) })} /></Field>
        <Field label="Priority"><select className="input" {...register(`activities.${index}.priority`, { setValueAs: emptyToNull })}><option value="">None</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></Field>
        <Field label="Risk"><select className="input" {...register(`activities.${index}.risk`, { setValueAs: emptyToNull })}><option value="">None</option><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></Field>
        <Field label="Source row ID"><input className="input" {...register(`activities.${index}.sourceRowId`, { setValueAs: emptyToNull })} /></Field>
        <div className="space-y-2 pt-6"><label className="flex items-center gap-2 text-body-sm"><input type="checkbox" {...register(`activities.${index}.isBlocked`)} /> Blocked</label><label className="flex items-center gap-2 text-body-sm"><input type="checkbox" {...register(`activities.${index}.isApproval`)} /> Approval step</label></div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Description"><textarea rows={2} className="input" {...register(`activities.${index}.description`, { setValueAs: emptyToNull })} /></Field><Field label="Blocker details"><textarea rows={2} className="input" {...register(`activities.${index}.blockerDetails`, { setValueAs: emptyToNull })} /></Field></div>
    </div>
  )
}

function DraftGantt({ activities }: { activities: NormalizedProjectCreationDraft['activities'] }) {
  const dated = activities.filter((item) => item.startDate && item.endDate)
  if (dated.length === 0) return <div className="rounded-card bg-surface-muted p-4 text-body-sm text-ink-secondary">Gantt preview appears as dates are added. Undated activities remain editable below.</div>
  const min = Math.min(...dated.map((item) => new Date(`${item.startDate}T00:00:00Z`).getTime()))
  const max = Math.max(...dated.map((item) => new Date(`${item.endDate}T00:00:00Z`).getTime()))
  const range = Math.max(86_400_000, max - min + 86_400_000)
  return <div className="max-h-56 space-y-2 overflow-auto rounded-card bg-surface-muted p-4" aria-label="Draft Gantt preview">{dated.map((item) => { const start = new Date(`${item.startDate}T00:00:00Z`).getTime(); const end = new Date(`${item.endDate}T00:00:00Z`).getTime(); return <div key={item.id} className="grid grid-cols-[9rem_1fr] items-center gap-3"><span className="truncate text-body-sm text-ink-secondary">{item.title}</span><div className="relative h-5 rounded-pill bg-surface-card"><span className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-pill bg-primary" style={{ left: `${((start - min) / range) * 100}%`, width: `${Math.max(2, ((end - start + 86_400_000) / range) * 100)}%` }} /></div></div> })}</div>
}

function DeliverablesPanel({ values, register, mutate, requestDelete }: PanelCrudProps) {
  const add = () => mutate((next) => next.deliverables.push({ id: newId('deliverable'), milestoneId: next.milestones[0]?.id ?? '', name: 'New deliverable', producingActivityIds: [], dueDate: null, ownerParty: '360GROUND', approvalActivityId: null, approvalCriteria: null }))
  return <div className="space-y-4"><div className="flex justify-between gap-3"><PanelHeading title="Deliverables" description="Control what is produced, by whom, when, and how it is approved." /><Button type="button" size="sm" disabled={values.milestones.length === 0} onClick={add}><Plus data-icon="inline-start" /> Add deliverable</Button></div>{values.deliverables.length === 0 ? <EmptyState bare icon={PackageCheck} title="No deliverables" description="Add a milestone first, then define its deliverables." action={values.milestones.length ? { label: 'Add deliverable', onClick: add } : undefined} /> : values.deliverables.map((item, index) => <div key={item.id} className="rounded-card border border-border p-4"><div className="grid gap-3 lg:grid-cols-[1fr_12rem_auto]"><Field label="Deliverable name"><input className="input" {...register(`deliverables.${index}.name`)} /></Field><Field label="Milestone"><select className="input" {...register(`deliverables.${index}.milestoneId`)}>{values.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}</select></Field><RowActions onUp={() => mutate((next) => { next.deliverables = movePlainItem(next.deliverables, index, -1) })} onDown={() => mutate((next) => { next.deliverables = movePlainItem(next.deliverables, index, 1) })} onDuplicate={() => mutate((next) => next.deliverables.splice(index + 1, 0, { ...next.deliverables[index], id: newId('deliverable'), name: `${item.name} copy` }))} onDelete={() => requestDelete('Delete deliverable?', 'This removes the deliverable from the private draft.', () => mutate((next) => { next.deliverables = next.deliverables.filter((candidate) => candidate.id !== item.id) }))} /></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Producing activities"><select multiple className="input min-h-24" {...register(`deliverables.${index}.producingActivityIds`)}>{values.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></Field><Field label="Due date"><input type="date" className="input" {...register(`deliverables.${index}.dueDate`, { setValueAs: emptyToNull })} /></Field><Field label="Owner"><select className="input" {...register(`deliverables.${index}.ownerParty`)}><option value="360GROUND">360GROUND</option><option value="CLIENT">CLIENT</option><option value="SHARED">SHARED</option></select></Field><Field label="Approval step"><select className="input" {...register(`deliverables.${index}.approvalActivityId`, { setValueAs: emptyToNull })}><option value="">None</option>{values.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></Field></div><Field label="Approval criteria"><textarea rows={2} className="input mt-3" {...register(`deliverables.${index}.approvalCriteria`, { setValueAs: emptyToNull })} /></Field></div>)}</div>
}

function DependenciesPanel({ values, register, mutate, requestDelete }: PanelCrudProps) {
  const add = () => mutate((next) => { if (next.activities.length < 2) return; next.dependencies.push({ id: newId('dependency'), predecessorActivityId: next.activities[0].id, successorActivityId: next.activities[1].id, type: 'FS', lagDays: 0 }) })
  return <div className="space-y-4"><div className="flex justify-between gap-3"><PanelHeading title="Dependencies" description="Edit predecessor/successor links. Circular links are flagged before save." /><Button type="button" size="sm" disabled={values.activities.length < 2} onClick={add}><Plus data-icon="inline-start" /> Add dependency</Button></div>{values.dependencies.length === 0 ? <EmptyState bare icon={GitBranch} title="No dependencies" description="At least two activities are needed to add a dependency." action={values.activities.length >= 2 ? { label: 'Add dependency', onClick: add } : undefined} /> : values.dependencies.map((item, index) => { const createsCycle = wouldCreateDependencyCycle(values.dependencies.filter((_, candidateIndex) => candidateIndex !== index).map((dependency) => ({ predecessorId: dependency.predecessorActivityId, successorId: dependency.successorActivityId })), { predecessorId: item.predecessorActivityId, successorId: item.successorActivityId }); return <div key={item.id} className={cn('rounded-card border p-4', createsCycle ? 'border-danger-500/40 bg-danger-50' : 'border-border')}><div className="grid gap-3 lg:grid-cols-[1fr_1fr_7rem_7rem_auto]"><Field label="Predecessor"><select className="input" {...register(`dependencies.${index}.predecessorActivityId`)}>{values.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></Field><Field label="Successor"><select className="input" {...register(`dependencies.${index}.successorActivityId`)}>{values.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}</select></Field><Field label="Type"><select className="input" {...register(`dependencies.${index}.type`)}><option>FS</option><option>SS</option><option>FF</option><option>SF</option></select></Field><Field label="Lag days"><input type="number" min={-365} max={365} className="input" {...register(`dependencies.${index}.lagDays`, { valueAsNumber: true })} /></Field><RowActions onUp={() => mutate((next) => { next.dependencies = movePlainItem(next.dependencies, index, -1) })} onDown={() => mutate((next) => { next.dependencies = movePlainItem(next.dependencies, index, 1) })} onDuplicate={() => mutate((next) => next.dependencies.splice(index + 1, 0, { ...next.dependencies[index], id: newId('dependency') }))} onDelete={() => requestDelete('Delete dependency?', 'This removes only the selected link from the private draft.', () => mutate((next) => { next.dependencies = next.dependencies.filter((candidate) => candidate.id !== item.id) }))} /></div>{createsCycle && <p role="alert" className="mt-2 flex items-center gap-2 text-body-sm text-danger-700"><AlertTriangle className="size-4" /> This link creates a dependency cycle.</p>}</div> })}</div>
}

function AssumptionsPanel({ values, register, mutate, requestDelete }: PanelCrudProps) {
  const addAssumption = () => mutate((next) => next.assumptions.push({ id: newId('assumption'), text: 'New assumption', category: 'OTHER', affectedPaths: [], sourceIds: [], status: 'PROPOSED' }))
  const addQuestion = () => mutate((next) => next.questions.push({ id: newId('question'), round: Math.max(1, ...next.questions.map((item) => item.round)), text: 'New question', impact: 'MEDIUM', affectedPaths: [], status: 'OPEN', answer: null }))
  return <div className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><PanelHeading title="Assumptions & Questions" description="Accept or reject planning assumptions and answer clarification questions." /><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={addQuestion}><Plus data-icon="inline-start" /> Question</Button><Button type="button" size="sm" onClick={addAssumption}><Plus data-icon="inline-start" /> Assumption</Button></div></div><h4 className="text-body font-semibold text-ink-primary">Assumptions</h4>{values.assumptions.length === 0 ? <EmptyState bare icon={Sparkles} title="No assumptions" /> : values.assumptions.map((item, index) => <div key={item.id} className="rounded-card border border-border p-4"><div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_auto]"><Field label="Assumption"><textarea rows={2} className="input" {...register(`assumptions.${index}.text`)} /></Field><Field label="Category"><select className="input" {...register(`assumptions.${index}.category`)}>{['SCOPE','DATE','DELIVERABLE','OWNERSHIP','DEPENDENCY','EFFORT','OTHER'].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Status"><select className="input" {...register(`assumptions.${index}.status`)}><option>PROPOSED</option><option>ACCEPTED</option><option>REJECTED</option></select></Field><DeleteOnly onDelete={() => requestDelete('Delete assumption?', 'This removes the assumption from the private draft.', () => mutate((next) => { next.assumptions = next.assumptions.filter((candidate) => candidate.id !== item.id) }))} /></div><DelimitedField label="Affected paths" path={`assumptions.${index}.affectedPaths`} values={item.affectedPaths} register={register} /><DelimitedField label="Source IDs" path={`assumptions.${index}.sourceIds`} values={item.sourceIds} register={register} /></div>)}<h4 className="text-body font-semibold text-ink-primary">Questions</h4>{values.questions.length === 0 ? <EmptyState bare icon={ListChecks} title="No open questions" /> : values.questions.map((item, index) => <div key={item.id} className="rounded-card border border-border p-4"><div className="grid gap-3 sm:grid-cols-[6rem_1fr_9rem_12rem_auto]"><Field label="Round"><input type="number" min={1} className="input" {...register(`questions.${index}.round`, { valueAsNumber: true })} /></Field><Field label="Question"><textarea rows={2} className="input" {...register(`questions.${index}.text`)} /></Field><Field label="Impact"><select className="input" {...register(`questions.${index}.impact`)}><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></Field><Field label="Status"><select className="input" {...register(`questions.${index}.status`)}><option>OPEN</option><option>ANSWERED</option><option>CONTINUED_WITH_ASSUMPTION</option></select></Field><DeleteOnly onDelete={() => requestDelete('Delete question?', 'This removes the question from the private draft.', () => mutate((next) => { next.questions = next.questions.filter((candidate) => candidate.id !== item.id) }))} /></div><Field label="Answer"><textarea rows={2} className="input mt-3" {...register(`questions.${index}.answer`, { setValueAs: emptyToNull })} /></Field><DelimitedField label="Affected paths" path={`questions.${index}.affectedPaths`} values={item.affectedPaths} register={register} /></div>)}</div>
}

function ValidationPanel({ values, register, setPanel }: { values: NormalizedProjectCreationDraft; register: Register; setPanel: (panel: PanelId) => void }) {
  const blocking = values.issues.filter((item) => item.severity === 'BLOCKING').length
  return <div className="space-y-4"><PanelHeading title="Validation" description="Resolve deterministic errors before creation; warnings remain visible and acknowledgeable." /><div className="grid grid-cols-3 gap-3">{[['Blocking', blocking], ['Warnings', values.issues.filter((item) => item.severity === 'WARNING').length + values.warnings.length], ['Info', values.issues.filter((item) => item.severity === 'INFO').length]].map(([label, count]) => <div key={String(label)} className="rounded-card bg-surface-muted p-3"><div className="text-overline text-ink-tertiary">{label}</div><div className="text-section-title text-ink-primary">{count}</div></div>)}</div>{values.issues.length === 0 && values.warnings.length === 0 ? <EmptyState bare icon={Check} title="No validation findings" description="The draft has no saved deterministic findings." /> : <div className="space-y-3">{values.issues.map((item) => <div key={item.id} className={cn('rounded-card border p-4', item.severity === 'BLOCKING' ? 'border-danger-500/30 bg-danger-50' : 'border-warning-500/30 bg-warning-50')}><div className="flex flex-wrap items-center gap-2"><span className="text-overline">{item.severity}</span><span className="text-body-sm font-semibold">{item.code}</span>{item.sourceRow && <span className="text-body-sm text-ink-tertiary">Row {item.sourceRow}</span>}</div><p className="mt-1 text-body-sm text-ink-primary">{item.message}</p>{item.suggestedCorrection && <p className="mt-1 text-body-sm text-ink-secondary">Correction: {item.suggestedCorrection}</p>}<Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setPanel(item.affectedPaths.some((path) => path.startsWith('project')) ? 'project' : item.affectedPaths.some((path) => path.includes('dependencies')) ? 'dependencies' : 'schedule')}>Open affected panel</Button></div>)}{values.warnings.map((item, index) => <label key={item.id} className="block rounded-card border border-warning-500/30 bg-warning-50 p-4"><span className="text-body-sm font-semibold text-ink-primary">{item.code}</span><span className="mt-1 block text-body-sm text-ink-secondary">{item.message}</span><span className="mt-2 flex items-center gap-2 text-body-sm"><input type="checkbox" {...register(`warnings.${index}.acknowledged`)} /> Acknowledged</span></label>)}</div>}</div>
}

function SourcesPanel({ values, register, mutate }: PanelCrudProps) {
  const decide = (changeIds: string[], decision: 'ACCEPT' | 'REJECT'): string | null => {
    try {
      mutate((next) => Object.assign(next, decideProjectCreationCleanupChanges(next, changeIds, decision)))
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'The cleanup decision could not be applied.'
    }
  }
  return <div className="space-y-5"><PanelHeading title="Source & Changes" description="Resolve uncertain mappings and explicitly accept or reject each proposed cleanup." /><h4 className="text-body font-semibold text-ink-primary">Sources</h4>{values.sources.length === 0 ? <EmptyState bare icon={FileText} title="No source references" /> : values.sources.map((item, index) => <div key={item.id} className="rounded-card border border-border p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Type"><select className="input" {...register(`sources.${index}.type`)}>{['USER_INPUT','SPREADSHEET_CELL','SPREADSHEET_ROW','DOCX_HEADING','DOCX_PARAGRAPH','DOCX_TABLE','TEMPLATE','AI_ASSUMPTION'].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Reference"><input className="input" {...register(`sources.${index}.reference`)} /></Field><Field label="Basis"><select className="input" {...register(`sources.${index}.basis`)}><option>SOURCE_FACT</option><option>INFERRED_RECOMMENDATION</option><option>USER_DECISION</option><option>TEMPLATE_DEFAULT</option></select></Field><Field label="Confidence"><select className="input" {...register(`sources.${index}.confidence`)}><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></Field><Field label="Last editor"><select className="input" {...register(`sources.${index}.lastEditor`)}><option>USER</option><option>AI</option></select></Field><Field label="Excerpt"><textarea rows={2} className="input" {...register(`sources.${index}.excerpt`, { setValueAs: emptyToNull })} /></Field><div className="lg:col-span-2"><DelimitedField label="Mapped target paths" path={`sources.${index}.targetPaths`} values={item.targetPaths} register={register} /></div></div></div>)}<ChangeListPanel changes={values.changes} onAccept={(ids) => decide(ids, 'ACCEPT')} onReject={(ids) => decide(ids, 'REJECT')} /></div>
}

interface PanelCrudProps {
  values: NormalizedProjectCreationDraft
  register: Register
  mutate: (callback: (next: NormalizedProjectCreationDraft) => void) => void
  requestDelete: (title: string, message: string, action: () => void) => void
}

function movePlainItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

function RowActions({ onUp, onDown, onDuplicate, onDelete }: { onUp: () => void; onDown: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return <div className="flex items-end gap-1"><IconButton label="Move up" onClick={onUp}><ArrowUp /></IconButton><IconButton label="Move down" onClick={onDown}><ArrowDown /></IconButton><IconButton label="Duplicate" onClick={onDuplicate}><Copy /></IconButton><IconButton label="Delete" onClick={onDelete} danger><Trash2 /></IconButton></div>
}

function DeleteOnly({ onDelete }: { onDelete: () => void }) { return <div className="flex items-end"><IconButton label="Delete" onClick={onDelete} danger><Trash2 /></IconButton></div> }

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={cn('flex size-9 items-center justify-center rounded-lg border border-border transition-colors [&>svg]:size-4', danger ? 'text-danger-700 hover:bg-danger-50' : 'text-ink-secondary hover:bg-surface-hover')}>{children}</button>
}

function PanelHeading({ title, description }: { title: string; description: string }) { return <div><h3 className="text-section-title text-ink-primary">{title}</h3><p className="mt-1 text-body-sm text-ink-secondary">{description}</p></div> }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-body-sm font-medium text-ink-primary">{label}</span>{children}</label> }

function NullableNumber({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) { return <input type="number" min={0} step="any" className="input" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} /> }

function DelimitedField({ label, path, values, register }: { label: string; path: string; values: string[]; register: Register }) {
  return <Field label={label}><input className="input" defaultValue={values.join('; ')} {...register(path as never, { setValueAs: (value) => String(value).split(';').map((item) => item.trim()).filter(Boolean) })} /></Field>
}
