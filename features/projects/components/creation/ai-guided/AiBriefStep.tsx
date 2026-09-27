'use client'

import { useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { FileText, FileUp, Info, ListChecks, Plus, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  AI_GUIDED_BRIEF_LIMITS,
  AI_GUIDED_WEEKDAYS,
  type AiGuidedBrief,
} from '@/lib/projects/ai-guided-brief'
import { PROJECT_TYPES, PROJECT_TYPE_LABEL } from '../../../types'

export type AiBriefAction = 'SAVE' | 'CLARIFY' | 'GENERATE'

interface BriefFormValues {
  mode: 'BRIEF' | 'TOR'
  name: string
  projectType: string
  projectTypeOther: string
  plannedStart: string
  plannedEnd: string
  clientName: string
  objective: string
  businessOutcome: string
  scopeIncluded: string
  scopeExcluded: string
  deliverables: Array<{ name: string; approvalCriteria: string }>
  knownMilestones: Array<{ name: string; date: string }>
  methodology: string
  team: Array<{ role: string; name: string; email: string }>
  clientResponsibilities: string
  internalResponsibilities: string
  dependenciesConstraints: string
  approvalProcess: string
  risksAssumptions: string
  workingDays: string[]
  nonWorkingDates: string
  allowNonWorkingDates: boolean
  detailLevel: 'SUMMARY' | 'STANDARD' | 'DETAILED'
  notes: string
  torText: string
  providerNoticeAccepted: boolean
}

interface AiBriefStepProps {
  brief: AiGuidedBrief | null
  defaults: { name: string | null; clientName: string | null; plannedStart: string | null; plannedEnd: string | null }
  aiAvailable: boolean
  hasSchedule: boolean
  busyAction: AiBriefAction | null
  onSubmit: (brief: AiGuidedBrief, action: AiBriefAction) => Promise<void>
  /** Uploads a DOCX TOR (scanned + privately stored); resolves to its extracted text or null on failure. */
  onUploadTor?: (file: File) => Promise<{ torText: string; truncated: boolean } | null>
  onSaveExit: () => void
  onCancelEdit?: () => void
}

const nullable = (value: string) => value.trim() ? value.trim() : null
const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean)

function toFormValues(brief: AiGuidedBrief | null, defaults: AiBriefStepProps['defaults']): BriefFormValues {
  return {
    mode: brief?.mode ?? 'BRIEF',
    name: brief?.name ?? defaults.name ?? '',
    projectType: brief?.projectType ?? '',
    projectTypeOther: brief?.projectTypeOther ?? '',
    plannedStart: brief?.plannedStart ?? defaults.plannedStart ?? '',
    plannedEnd: brief?.plannedEnd ?? defaults.plannedEnd ?? '',
    clientName: brief?.clientName ?? defaults.clientName ?? '',
    objective: brief?.objective ?? '',
    businessOutcome: brief?.businessOutcome ?? '',
    scopeIncluded: brief?.scopeIncluded.join('\n') ?? '',
    scopeExcluded: brief?.scopeExcluded.join('\n') ?? '',
    deliverables: brief?.deliverables.map((item) => ({ name: item.name, approvalCriteria: item.approvalCriteria ?? '' })) ?? [{ name: '', approvalCriteria: '' }],
    knownMilestones: brief?.knownMilestones.map((item) => ({ name: item.name, date: item.date ?? '' })) ?? [],
    methodology: brief?.methodology ?? '',
    team: brief?.team.map((item) => ({ role: item.role, name: item.name ?? '', email: item.email ?? '' })) ?? [],
    clientResponsibilities: brief?.clientResponsibilities ?? '',
    internalResponsibilities: brief?.internalResponsibilities ?? '',
    dependenciesConstraints: brief?.dependenciesConstraints ?? '',
    approvalProcess: brief?.approvalProcess ?? '',
    risksAssumptions: brief?.risksAssumptions ?? '',
    workingDays: brief?.workingDays ?? ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    nonWorkingDates: brief?.nonWorkingDates.join('\n') ?? '',
    allowNonWorkingDates: brief?.allowNonWorkingDates ?? false,
    detailLevel: brief?.detailLevel ?? 'STANDARD',
    notes: brief?.notes ?? '',
    torText: brief?.torText ?? '',
    providerNoticeAccepted: false,
  }
}

function toBrief(values: BriefFormValues): AiGuidedBrief {
  const projectType = values.projectType ? values.projectType as AiGuidedBrief['projectType'] : null
  return {
    mode: values.mode,
    name: values.name.trim(),
    projectType,
    projectTypeOther: projectType === 'OTHER' ? nullable(values.projectTypeOther) : null,
    plannedStart: values.plannedStart,
    plannedEnd: values.plannedEnd,
    clientName: nullable(values.clientName),
    objective: nullable(values.objective),
    businessOutcome: nullable(values.businessOutcome),
    scopeIncluded: lines(values.scopeIncluded),
    scopeExcluded: lines(values.scopeExcluded),
    deliverables: values.deliverables
      .filter((item) => item.name.trim())
      .map((item) => ({ name: item.name.trim(), approvalCriteria: nullable(item.approvalCriteria) })),
    knownMilestones: values.knownMilestones
      .filter((item) => item.name.trim())
      .map((item) => ({ name: item.name.trim(), date: item.date || null })),
    methodology: nullable(values.methodology),
    team: values.team
      .filter((item) => item.role.trim())
      .map((item) => ({ role: item.role.trim(), name: nullable(item.name), email: nullable(item.email)?.toLowerCase() ?? null })),
    clientResponsibilities: nullable(values.clientResponsibilities),
    internalResponsibilities: nullable(values.internalResponsibilities),
    dependenciesConstraints: nullable(values.dependenciesConstraints),
    approvalProcess: nullable(values.approvalProcess),
    risksAssumptions: nullable(values.risksAssumptions),
    workingDays: values.workingDays as AiGuidedBrief['workingDays'],
    nonWorkingDates: lines(values.nonWorkingDates),
    allowNonWorkingDates: values.allowNonWorkingDates,
    detailLevel: values.detailLevel,
    notes: nullable(values.notes),
    torText: values.mode === 'TOR' ? nullable(values.torText) : null,
  }
}

function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-body-sm font-medium text-ink-primary">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-body-sm text-ink-tertiary">{hint}</span>}
      {error && <span className="mt-1 block text-body-sm text-danger-600">{error}</span>}
    </label>
  )
}

const TEXT_LIMIT = { maxLength: { value: AI_GUIDED_BRIEF_LIMITS.text, message: `Keep this under ${AI_GUIDED_BRIEF_LIMITS.text} characters` } }

export function AiBriefStep({ brief, defaults, aiAvailable, hasSchedule, busyAction, onSubmit, onUploadTor, onSaveExit, onCancelEdit }: AiBriefStepProps) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BriefFormValues>({ defaultValues: toFormValues(brief, defaults) })
  const deliverables = useFieldArray({ control, name: 'deliverables' })
  const milestones = useFieldArray({ control, name: 'knownMilestones' })
  const team = useFieldArray({ control, name: 'team' })
  const mode = watch('mode')
  const projectType = watch('projectType')
  const noticeAccepted = watch('providerNoticeAccepted')
  const torLength = watch('torText')?.length ?? 0
  const torFileInput = useRef<HTMLInputElement>(null)
  const [torUpload, setTorUpload] = useState<{ state: 'idle' | 'uploading' | 'done'; fileName?: string; truncated?: boolean }>({ state: 'idle' })
  const busy = busyAction !== null || torUpload.state === 'uploading'

  const uploadTor = async (file: File | undefined) => {
    if (!file || !onUploadTor) return
    setTorUpload({ state: 'uploading', fileName: file.name })
    const result = await onUploadTor(file)
    if (torFileInput.current) torFileInput.current.value = ''
    if (!result) { setTorUpload({ state: 'idle' }); return }
    setValue('torText', result.torText, { shouldDirty: true, shouldValidate: true })
    setTorUpload({ state: 'done', fileName: file.name, truncated: result.truncated })
  }

  const submit = (action: AiBriefAction) => handleSubmit(async (values) => {
    await onSubmit(toBrief(values), action)
  })

  return (
    <form className="space-y-6" onSubmit={(event) => event.preventDefault()} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-section-title text-ink-primary">Describe the project</h3>
          <p className="mt-1 text-body text-ink-secondary">AI prepares an editable plan from this brief. Nothing is created until you review and confirm.</p>
        </div>
        <div role="tablist" aria-label="Brief mode" className="inline-flex shrink-0 rounded-pill bg-surface-muted p-1">
          {([['BRIEF', 'Guided brief', ListChecks], ['TOR', 'Paste a TOR', FileText]] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setValue('mode', value)}
              className={cn('inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-body-sm font-medium transition-colors duration-[180ms] ease-apple', mode === value ? 'bg-surface-card text-ink-primary shadow-card' : 'text-ink-secondary hover:text-ink-primary')}
            >
              <Icon className="size-4" strokeWidth={1.75} /> {label}
            </button>
          ))}
        </div>
      </div>

      <section className="space-y-4 rounded-card border border-border bg-surface-card p-5 shadow-card" aria-labelledby="ai-brief-required">
        <h4 id="ai-brief-required" className="text-body font-semibold text-ink-primary">Required</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name or working title" error={errors.name?.message} className="sm:col-span-2">
            <input className="input" {...register('name', { required: 'Enter a project name', minLength: { value: 3, message: 'Use at least 3 characters' }, maxLength: { value: 200, message: 'Keep the name under 200 characters' } })} />
          </Field>
          <Field label={mode === 'BRIEF' ? 'Project type' : 'Project type (optional in TOR mode)'} error={errors.projectType?.message}>
            <select className="input" {...register('projectType', { validate: (value) => mode === 'TOR' || Boolean(value) || 'Choose a project type' })}>
              <option value="">Select a type</option>
              {PROJECT_TYPES.map((type) => <option key={type} value={type}>{PROJECT_TYPE_LABEL[type]}</option>)}
              <option value="OTHER">Other</option>
            </select>
          </Field>
          {projectType === 'OTHER' ? (
            <Field label="Describe the project type" error={errors.projectTypeOther?.message}>
              <input className="input" {...register('projectTypeOther', { validate: (value) => projectType !== 'OTHER' || Boolean(value.trim()) || 'Describe the project type' })} />
            </Field>
          ) : <div className="hidden sm:block" />}
          <Field label="Planned start" error={errors.plannedStart?.message}>
            <input type="date" className="input" {...register('plannedStart', { required: 'Choose a start date' })} />
          </Field>
          <Field label="Planned end" error={errors.plannedEnd?.message}>
            <input type="date" className="input" {...register('plannedEnd', { required: 'Choose an end date', validate: (value, all) => !all.plannedStart || value > all.plannedStart || 'End must be after start' })} />
          </Field>
        </div>

        {mode === 'TOR' && onUploadTor ? (
          <div className="flex flex-col gap-2 rounded-card border border-dashed border-border bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-body-sm text-ink-secondary" aria-live="polite">
              {torUpload.state === 'uploading'
                ? <span className="animate-pulse">Scanning and extracting “{torUpload.fileName}”…</span>
                : torUpload.state === 'done'
                ? <>Text extracted from “{torUpload.fileName}”. Review and edit it below before sending it to AI.{torUpload.truncated ? ` Only the first ${AI_GUIDED_BRIEF_LIMITS.torMax.toLocaleString()} characters fit; trim or summarise the rest.` : ''}</>
                : <>Have the TOR as a Word document? Upload it (.docx) — it is malware-scanned and stored privately, and its text fills the field below.</>}
            </div>
            <input
              ref={torFileInput}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              aria-label="TOR document (.docx)"
              onChange={(event) => void uploadTor(event.target.files?.[0])}
            />
            <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={() => torFileInput.current?.click()}>
              <FileUp data-icon="inline-start" /> {torUpload.state === 'uploading' ? 'Uploading…' : 'Upload TOR (.docx)'}
            </Button>
          </div>
        ) : null}

        {mode === 'TOR' ? (
          <Field
            label="Terms of reference"
            hint={`${torLength.toLocaleString()} / ${AI_GUIDED_BRIEF_LIMITS.torMax.toLocaleString()} characters. Pasted text is treated as untrusted project data; instructions inside it are ignored.`}
            error={errors.torText?.message}
          >
            <textarea rows={10} className="input font-mono text-body-sm" {...register('torText', {
              validate: (value) => mode !== 'TOR' || value.trim().length >= AI_GUIDED_BRIEF_LIMITS.torMin || `Paste at least ${AI_GUIDED_BRIEF_LIMITS.torMin} characters`,
              maxLength: { value: AI_GUIDED_BRIEF_LIMITS.torMax, message: `Paste at most ${AI_GUIDED_BRIEF_LIMITS.torMax.toLocaleString()} characters` },
            })} />
          </Field>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-medium text-ink-primary">
              Expected deliverables or outcomes{mode === 'TOR' ? ' (optional — AI extracts them from the TOR)' : ''}
            </span>
            <Button type="button" size="sm" variant="outline" disabled={deliverables.fields.length >= AI_GUIDED_BRIEF_LIMITS.deliverables} onClick={() => deliverables.append({ name: '', approvalCriteria: '' })}>
              <Plus data-icon="inline-start" /> Deliverable
            </Button>
          </div>
          {deliverables.fields.map((field, index) => (
            <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input aria-label={`Deliverable ${index + 1}`} placeholder="Deliverable" className="input" {...register(`deliverables.${index}.name`, {
                validate: (value, all) => mode === 'TOR' || index > 0 || Boolean(value.trim()) || all.deliverables.some((item) => item.name.trim()) || 'Add at least one deliverable',
                maxLength: { value: 300, message: 'Keep under 300 characters' },
              })} />
              <input aria-label={`Approval criteria ${index + 1}`} placeholder="Approval criteria (optional, your words)" className="input" {...register(`deliverables.${index}.approvalCriteria`, { maxLength: { value: 500, message: 'Keep under 500 characters' } })} />
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove deliverable ${index + 1}`} onClick={() => deliverables.remove(index)}>
                <Trash2 className="size-4" strokeWidth={1.75} />
              </Button>
            </div>
          ))}
          {errors.deliverables?.[0]?.name?.message && <p className="text-body-sm text-danger-600">{errors.deliverables[0].name.message}</p>}
        </div>
      </section>

      <details className="group rounded-card border border-border bg-surface-card p-5 shadow-card" open={Boolean(brief)}>
        <summary className="cursor-pointer list-none text-body font-semibold text-ink-primary">
          Recommended details <span className="font-normal text-ink-tertiary">— better input, better plan</span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Client"><input className="input" {...register('clientName', { maxLength: { value: 200, message: 'Keep under 200 characters' } })} /></Field>
          <Field label="Delivery approach or methodology" error={errors.methodology?.message}><input className="input" {...register('methodology', TEXT_LIMIT)} /></Field>
          <Field label="Project objective" error={errors.objective?.message}><textarea rows={2} className="input" {...register('objective', TEXT_LIMIT)} /></Field>
          <Field label="Business outcome" error={errors.businessOutcome?.message}><textarea rows={2} className="input" {...register('businessOutcome', TEXT_LIMIT)} /></Field>
          <Field label="Scope included" hint="One item per line"><textarea rows={3} className="input" {...register('scopeIncluded')} /></Field>
          <Field label="Scope excluded" hint="One item per line"><textarea rows={3} className="input" {...register('scopeExcluded')} /></Field>
          <Field label="Client responsibilities" error={errors.clientResponsibilities?.message}><textarea rows={2} className="input" {...register('clientResponsibilities', TEXT_LIMIT)} /></Field>
          <Field label="Internal responsibilities" error={errors.internalResponsibilities?.message}><textarea rows={2} className="input" {...register('internalResponsibilities', TEXT_LIMIT)} /></Field>
          <Field label="Dependencies and constraints" error={errors.dependenciesConstraints?.message}><textarea rows={2} className="input" {...register('dependenciesConstraints', TEXT_LIMIT)} /></Field>
          <Field label="Approval process" error={errors.approvalProcess?.message}><textarea rows={2} className="input" {...register('approvalProcess', TEXT_LIMIT)} /></Field>
          <Field label="Known risks and assumptions" error={errors.risksAssumptions?.message} className="sm:col-span-2"><textarea rows={2} className="input" {...register('risksAssumptions', TEXT_LIMIT)} /></Field>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-medium text-ink-primary">Known milestones or contractual dates</span>
            <Button type="button" size="sm" variant="outline" disabled={milestones.fields.length >= AI_GUIDED_BRIEF_LIMITS.knownMilestones} onClick={() => milestones.append({ name: '', date: '' })}>
              <Plus data-icon="inline-start" /> Milestone
            </Button>
          </div>
          {milestones.fields.map((field, index) => (
            <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
              <input aria-label={`Milestone ${index + 1}`} placeholder="Milestone" className="input" {...register(`knownMilestones.${index}.name`, { maxLength: 300 })} />
              <input aria-label={`Milestone ${index + 1} date`} type="date" className="input" {...register(`knownMilestones.${index}.date`)} />
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove milestone ${index + 1}`} onClick={() => milestones.remove(index)}><Trash2 className="size-4" strokeWidth={1.75} /></Button>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-medium text-ink-primary">Team roles or named assignees</span>
            <Button type="button" size="sm" variant="outline" disabled={team.fields.length >= AI_GUIDED_BRIEF_LIMITS.team} onClick={() => team.append({ role: '', name: '', email: '' })}>
              <Plus data-icon="inline-start" /> Role
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-body-sm text-ink-tertiary">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            Only roles are sent to AI. A person is assigned only when the name or email exactly matches one active user; otherwise the role is suggested.
          </p>
          {team.fields.map((field, index) => (
            <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input aria-label={`Role ${index + 1}`} placeholder="Role, e.g. QA Lead" className="input" {...register(`team.${index}.role`, { maxLength: 100 })} />
              <input aria-label={`Person ${index + 1}`} placeholder="Name (optional)" className="input" {...register(`team.${index}.name`, { maxLength: 200 })} />
              <input aria-label={`Email ${index + 1}`} type="email" placeholder="Email (optional)" className="input" {...register(`team.${index}.email`, { maxLength: 320 })} />
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove role ${index + 1}`} onClick={() => team.remove(index)}><Trash2 className="size-4" strokeWidth={1.75} /></Button>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 text-body-sm font-medium text-ink-primary">Working days</legend>
            <div className="flex flex-wrap gap-2">
              {AI_GUIDED_WEEKDAYS.map((day) => (
                <label key={day} className="inline-flex items-center gap-1.5 rounded-pill border border-border px-2.5 py-1 text-body-sm">
                  <input type="checkbox" value={day} {...register('workingDays', { validate: (value) => value.length > 0 || 'Choose at least one working day' })} /> {day.slice(0, 1)}{day.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
            {errors.workingDays?.message && <p className="mt-1 text-body-sm text-danger-600">{errors.workingDays.message}</p>}
            <label className="mt-2 flex items-center gap-2 text-body-sm text-ink-secondary">
              <input type="checkbox" {...register('allowNonWorkingDates')} /> Allow work on non-working days
            </label>
          </fieldset>
          <Field label="Non-working dates" hint="One YYYY-MM-DD date per line" error={errors.nonWorkingDates?.message}>
            <textarea rows={3} className="input" {...register('nonWorkingDates', {
              validate: (value) => lines(value).every((line) => /^\d{4}-\d{2}-\d{2}$/.test(line)) || 'Use YYYY-MM-DD, one per line',
            })} />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-body-sm font-medium text-ink-primary">Desired schedule detail</legend>
            <div className="flex flex-wrap gap-2">
              {(['SUMMARY', 'STANDARD', 'DETAILED'] as const).map((level) => (
                <label key={level} className="inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1 text-body-sm">
                  <input type="radio" value={level} {...register('detailLevel')} /> {level.charAt(0)}{level.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Anything else AI should know" hint="Free text. Emails and credentials are removed before sending." className="sm:col-span-2" error={errors.notes?.message}>
            <textarea rows={3} className="input" {...register('notes', { maxLength: { value: AI_GUIDED_BRIEF_LIMITS.notes, message: `Keep under ${AI_GUIDED_BRIEF_LIMITS.notes} characters` } })} />
          </Field>
        </div>
      </details>

      <div className="flex items-start gap-3 rounded-card border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} />
        <div className="space-y-2">
          <p className="text-body-sm text-ink-primary">
            Asking AI sends this brief{mode === 'TOR' ? ' and the pasted TOR' : ''} to the organization&apos;s configured OpenAI provider. Team names and emails are never sent, known employee names, emails and credentials are redacted, and no other project, user, or client data is included. AI only proposes an editable private draft — it cannot create the project, notify anyone, or publish anything.
          </p>
          <label className="flex items-center gap-2 text-body-sm font-medium text-ink-primary">
            <input type="checkbox" {...register('providerNoticeAccepted')} /> I understand and want to send this brief to OpenAI
          </label>
        </div>
      </div>

      {!aiAvailable && (
        <p className="rounded-card border border-warning-500/30 bg-warning-50 p-3 text-body-sm text-ink-primary">
          AI is not available right now (no verified OpenAI key). You can save the brief and continue with Manual or Import.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={onSaveExit} disabled={busy}>Save and exit</Button>
          {onCancelEdit && <Button type="button" variant="outline" onClick={onCancelEdit} disabled={busy}>Back to plan</Button>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={submit('SAVE')}>
            <Save data-icon="inline-start" /> {busyAction === 'SAVE' ? 'Saving…' : 'Save brief'}
          </Button>
          {!hasSchedule && (
            <Button type="button" variant="outline" disabled={busy || !aiAvailable || !noticeAccepted} onClick={submit('CLARIFY')}>
              <ListChecks data-icon="inline-start" /> {busyAction === 'CLARIFY' ? 'Checking the brief…' : 'Check for questions'}
            </Button>
          )}
          <Button type="button" disabled={busy || !aiAvailable || !noticeAccepted} onClick={submit('GENERATE')}>
            <Sparkles data-icon="inline-start" /> {busyAction === 'GENERATE' ? 'Generating plan…' : hasSchedule ? 'Regenerate plan' : 'Generate plan'}
          </Button>
        </div>
      </div>
    </form>
  )
}
