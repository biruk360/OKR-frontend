'use client'

import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Check, ChevronRight, LayoutTemplate, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useDepartments } from '@/hooks/useDepartments'
import CustomerLookup from '@/components/customers/CustomerLookup'
import { createManualReviewScheduleJson, createManualScheduleJson, getManualTemplateId } from '@/lib/projects/manual-creation'
import {
  useProjectTemplate,
  useProjectTemplates,
  useUpdateProjectCreationDraft,
  type ProjectCreationDraftNode,
  type ProjectTemplateDetail,
} from '../hooks/useProjects'
import type { CommitProjectCreationDraftResult } from '@/lib/projects/creation-commit-shared'
import { ProjectDatePicker } from './ProjectDatePicker'
import { DraftReviewWorkspace } from './creation/DraftReviewWorkspace'

interface Props {
  draft: ProjectCreationDraftNode
  currentUserId: string
  onDraftUpdated: (draft: ProjectCreationDraftNode) => void
  onCreated: (project: CommitProjectCreationDraftResult) => Promise<void> | void
  onSaveExit: () => void
  onProgressChange?: (step: 1 | 2 | 3) => void
}

interface FormValues {
  name: string
  code: string
  clientName: string
  description: string
  projectManagerId: string
  departmentId: string
  contractValue: string
  currency: 'ETB' | 'USD' | 'EUR'
  plannedStart: string
  plannedEnd: string
  templateId: string
}

const STEPS = ['Basics', 'Dates', 'Template', 'Review'] as const

export function CreateProjectWizard({
  draft,
  currentUserId,
  onDraftUpdated,
  onCreated,
  onSaveExit,
  onProgressChange,
}: Props) {
  const [step, setStep] = useState(0)
  const initial = draft.projectJson.project
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(initial.clientId)
  const { users, isLoading: usersLoading, isError: usersError } = useUsersForSelection({ enabled: true })
  const { departments, isLoading: departmentsLoading, isError: departmentsError } = useDepartments({ enabled: true })
  const {
    data: templates,
    isLoading: templatesLoading,
    isError: templatesError,
    refetch: refetchTemplates,
  } = useProjectTemplates()
  const updateDraft = useUpdateProjectCreationDraft(draft.id)

  const {
    control,
    register,
    watch,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: initial.name ?? '',
      code: initial.code ?? '',
      clientName: initial.clientName ?? '',
      description: initial.description ?? '',
      projectManagerId: initial.projectManagerId ?? currentUserId,
      departmentId: initial.departmentId ?? '',
      contractValue: initial.contractValue == null ? '' : String(initial.contractValue),
      currency: initial.currency,
      plannedStart: initial.plannedStart ?? '',
      plannedEnd: initial.plannedEnd ?? '',
      templateId: getManualTemplateId(draft.scheduleJson) ?? '',
    },
  })

  const templateId = watch('templateId')
  const selectedTemplateSummary = useMemo(
    () => templates?.find((template) => template.id === templateId) ?? null,
    [templateId, templates],
  )
  const selectedTemplate = useProjectTemplate(templateId || null)
  const startVal = watch('plannedStart')
  const endVal = watch('plannedEnd')
  const endBeforeStart = Boolean(startVal && endVal && endVal <= startVal)

  useEffect(() => {
    onProgressChange?.(step === STEPS.length - 1 ? 2 : 1)
  }, [onProgressChange, step])

  const fieldsForStep = (currentStep: number): (keyof FormValues)[] => {
    if (currentStep === 0) return ['name', 'clientName', 'projectManagerId']
    if (currentStep === 1) return ['plannedStart', 'plannedEnd']
    return []
  }

  const persist = async (values: FormValues, scheduleOverride?: ProjectCreationDraftNode['scheduleJson']) => {
    const contractValue = values.contractValue.trim() === '' ? null : Number(values.contractValue)
    const selectedTemplateId = values.templateId || null
    const existingTemplateId = getManualTemplateId(draft.scheduleJson)
    const scheduleJson = scheduleOverride ?? (
      draft.scheduleJson && existingTemplateId === selectedTemplateId
        ? draft.scheduleJson
        : createManualScheduleJson(selectedTemplateId)
    )
    const updated = await updateDraft.mutateAsync({
      version: draft.version,
      projectJson: {
        ...draft.projectJson,
        project: {
          ...draft.projectJson.project,
          name: values.name.trim() || null,
          code: values.code.trim() || null,
          clientName: values.clientName.trim() || null,
          clientId: odooPartnerId,
          description: values.description.trim() || null,
          projectManagerId: values.projectManagerId || null,
          departmentId: values.departmentId || null,
          contractValue: contractValue !== null && Number.isFinite(contractValue) ? contractValue : null,
          currency: values.currency,
          plannedStart: values.plannedStart || null,
          plannedEnd: values.plannedEnd || null,
        },
      },
      scheduleJson,
    })
    onDraftUpdated(updated)
    return updated
  }

  const next = async () => {
    const ok = await trigger(fieldsForStep(step))
    if (!ok || (step === 1 && endBeforeStart)) return
    try {
      const values = getValues()
      let scheduleOverride: ProjectCreationDraftNode['scheduleJson'] | undefined
      if (step === 2) {
        const selectedId = values.templateId || null
        const alreadyMaterialized = Boolean(
          draft.scheduleJson
          && getManualTemplateId(draft.scheduleJson) === selectedId
          && (selectedId === null || draft.scheduleJson.phases.length > 0),
        )
        if (!alreadyMaterialized) {
          scheduleOverride = createManualReviewScheduleJson(
            selectedId,
            selectedTemplate.data?.structureJson ?? null,
          )
        }
      }
      await persist(values, scheduleOverride)
      setStep((value) => Math.min(value + 1, STEPS.length - 1))
    } catch {
      // The shared mutation hook reports the safe API error and preserves this step.
    }
  }

  const saveAndExit = async () => {
    const ok = await trigger(fieldsForStep(step))
    if (!ok || (step === 1 && endBeforeStart)) return
    try {
      await persist(getValues())
      onSaveExit()
    } catch {
      // The shared mutation hook reports the safe API error and keeps the draft open.
    }
  }

  const busy = updateDraft.isPending

  if (step === 3) {
    return (
      <DraftReviewWorkspace
        draft={draft}
        onDraftUpdated={onDraftUpdated}
        onSaveExit={onSaveExit}
        onBack={() => setStep(2)}
        onCommitted={onCreated}
      />
    )
  }

  return (
    <form onSubmit={(event) => event.preventDefault()} className="space-y-5">
      <ol aria-label="Manual project steps" className="grid grid-cols-4 gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="min-w-0">
            <div className={cn('h-1 rounded-pill', index <= step ? 'bg-primary' : 'bg-surface-muted')} />
            <div className="mt-2 flex items-center gap-1.5">
              <span className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                index <= step ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-ink-tertiary',
              )}>
                {index < step ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className={cn(
                'truncate text-body-sm',
                index === step ? 'font-semibold text-ink-primary' : 'text-ink-tertiary',
              )}>{label}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-card border border-border bg-surface-card p-5 shadow-card">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Project Name" required error={errors.name?.message}>
              <input className="input" placeholder="e.g. Meda Platform"
                {...register('name', { required: 'Name is required', minLength: { value: 3, message: 'At least 3 characters' }, maxLength: { value: 200, message: 'Maximum 200 characters' } })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project Code" hint="Auto-generated if left blank">
                <input className="input" placeholder="PRJ-2026-###" {...register('code')} />
              </Field>
              <Field label="Client Name" required error={errors.clientName?.message}>
                <Controller
                  name="clientName"
                  control={control}
                  rules={{
                    required: 'Client is required',
                    minLength: { value: 2, message: 'At least 2 characters' },
                    validate: () => odooPartnerId !== null || 'Select a client from the Odoo results',
                  }}
                  render={({ field }) => (
                    <CustomerLookup
                      value={{ odooPartnerId, customerName: field.value }}
                      onChange={(customer) => {
                        setOdooPartnerId(customer.odooPartnerId)
                        field.onChange(customer.customerName)
                      }}
                    />
                  )}
                />
              </Field>
            </div>
            <Field label="Description" error={errors.description?.message}>
              <textarea rows={3} className="input" placeholder="Short description"
                {...register('description', { maxLength: { value: 2_000, message: 'Maximum 2,000 characters' } })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project Manager" required error={errors.projectManagerId?.message}>
                <select className="input" disabled={usersLoading || usersError} {...register('projectManagerId', { required: 'PM is required' })}>
                  {usersLoading && <option value="">Loading project managers…</option>}
                  {usersError && <option value="">Project managers unavailable</option>}
                  {users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
                </select>
                {usersError && <p className="mt-1 text-body-sm text-danger-600">Project managers could not be loaded. Save the draft and try again.</p>}
              </Field>
              <Field label="Department">
                <select className="input" disabled={departmentsLoading || departmentsError} {...register('departmentId')}>
                  <option value="">{departmentsLoading ? 'Loading departments…' : '— None —'}</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
                {departmentsError && <p className="mt-1 text-body-sm text-warning-700">Departments are unavailable. You may continue without one or retry later.</p>}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contract Value" error={errors.contractValue?.message}>
                <input type="number" min={0} step="any" className="input" placeholder="0"
                  {...register('contractValue', { min: { value: 0, message: 'Value cannot be negative' } })} />
              </Field>
              <Field label="Currency">
                <select className="input" {...register('currency')}>
                  <option value="ETB">ETB</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-section-title text-ink-primary">Project dates</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Planned Start" required error={errors.plannedStart?.message}>
                <Controller name="plannedStart" control={control} rules={{ required: 'Start date is required' }}
                  render={({ field }) => <ProjectDatePicker value={field.value} onChange={field.onChange} ariaLabel="Planned start date" allowClear={false} />} />
              </Field>
              <Field label="Planned End" required error={errors.plannedEnd?.message}>
                <Controller name="plannedEnd" control={control} rules={{ required: 'End date is required' }}
                  render={({ field }) => <ProjectDatePicker value={field.value} onChange={field.onChange} ariaLabel="Planned end date" allowClear={false} />} />
              </Field>
            </div>
            {endBeforeStart && <p className="text-body-sm text-danger-600">End date must be after start date.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div>
              <h3 className="text-section-title text-ink-primary">Choose a starting schedule</h3>
              <p className="mt-1 text-body-sm text-ink-secondary">Start blank or copy an approved system or custom lifecycle template.</p>
            </div>
            <label className={cn('flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors',
              templateId === '' ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-hover')}>
              <input type="radio" value="" className="mt-1" {...register('templateId')} />
              <div>
                <div className="text-body font-medium text-ink-primary">Start blank</div>
                <div className="text-body-sm text-ink-secondary">Create no phases, milestones, or activities.</div>
              </div>
            </label>
            {templatesLoading ? (
              <div className="space-y-2" aria-label="Loading project templates">
                <Skeleton className="h-20 rounded-card" /><Skeleton className="h-20 rounded-card" />
              </div>
            ) : templatesError ? (
              <div className="flex flex-col gap-3 rounded-card border border-danger-200 bg-danger-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-body-sm text-danger-700">Lifecycle templates could not be loaded. Start blank or retry.</p>
                <Button type="button" size="sm" variant="outline" onClick={() => refetchTemplates()}>Retry templates</Button>
              </div>
            ) : (templates ?? []).map((template) => (
              <label key={template.id} className={cn('flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors',
                templateId === template.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-hover')}>
                <input type="radio" value={template.id} className="mt-1" {...register('templateId')} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <LayoutTemplate className="size-4 text-primary" />
                    <span className="text-body font-medium text-ink-primary">{template.name}</span>
                    <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] text-ink-secondary">{template.isSystem ? 'System' : 'Custom'}</span>
                  </div>
                  {template.description && <p className="text-body-sm text-ink-secondary">{template.description}</p>}
                  <p className="mt-1 text-body-sm text-ink-tertiary">{template.phases} phases · {template.milestones} milestones · {template.activities} activities</p>
                </div>
              </label>
            ))}
            {templateId && (
              <TemplatePreview template={selectedTemplate.data ?? null} loading={selectedTemplate.isLoading} />
            )}
          </div>
        )}

      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" disabled={busy || step === 0} onClick={() => setStep((value) => Math.max(value - 1, 0))}>
          Back
        </Button>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={saveAndExit}>
            <Save data-icon="inline-start" /> {updateDraft.isPending ? 'Saving…' : 'Save and exit'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={busy} onClick={next}>
              Next <ChevronRight data-icon="inline-end" />
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  )
}

function TemplatePreview({ template, loading }: { template: ProjectTemplateDetail | null; loading: boolean }) {
  if (loading) return <Skeleton className="h-36 rounded-card" />
  if (!template) return <p className="rounded-card bg-danger-50 p-3 text-body-sm text-danger-700">This template could not be loaded. Choose another option before creating the project.</p>
  return (
    <div className="max-h-64 overflow-auto rounded-card border border-border bg-surface-muted p-4" aria-label={`${template.name} template tree`}>
      <ol className="space-y-3">
        {template.structureJson.phases.map((phase, phaseIndex) => (
          <li key={`${phase.name}-${phaseIndex}`}>
            <p className="text-body font-semibold text-ink-primary">{phaseIndex + 1}. {phase.name}</p>
            <ol className="ml-5 mt-1 space-y-1 border-l border-border pl-3">
              {phase.milestones.map((milestone, milestoneIndex) => (
                <li key={`${milestone.name}-${milestoneIndex}`}>
                  <p className="text-body-sm font-medium text-ink-secondary">{milestone.name}</p>
                  <ul className="ml-4 list-disc text-body-sm text-ink-tertiary">
                    {milestone.activities.map((activity, activityIndex) => (
                      <li key={`${activity.title}-${activityIndex}`}>{activity.title}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-overline text-ink-tertiary">{label}</dt><dd className="mt-0.5 text-body text-ink-primary">{value || '—'}</dd></div>
}

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-body-sm font-medium text-ink-primary">
        {label}{required && <span className="text-danger-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-body-sm text-ink-tertiary">{hint}</span>}
      {error && <span className="mt-1 block text-body-sm text-danger-600">{error}</span>}
    </label>
  )
}
