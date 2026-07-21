'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { FolderPlus, Check, LayoutTemplate } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useDepartments } from '@/hooks/useDepartments'
import CustomerLookup from '@/features/letters/components/CustomerLookup'
import { useCreateProject, useProjectTemplates, type CreateProjectPayload } from '../hooks/useProjects'
import { ProjectDatePicker } from './ProjectDatePicker'

interface Props {
  open: boolean
  onClose: () => void
  currentUserId: string
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

const STEPS = ['Basics', 'Schedule', 'Template'] as const

export function CreateProjectWizard({ open, onClose, currentUserId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [odooPartnerId, setOdooPartnerId] = useState<string | null>(null)
  const { users } = useUsersForSelection({ enabled: open })
  const { departments } = useDepartments({ enabled: open })
  const { data: templates } = useProjectTemplates()
  const createProject = useCreateProject()

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: '', code: '', clientName: '', description: '',
      projectManagerId: currentUserId, departmentId: '', contractValue: '',
      currency: 'ETB', plannedStart: '', plannedEnd: '', templateId: '',
    },
  })

  const close = () => { reset(); setOdooPartnerId(null); setStep(0); onClose() }

  const next = async () => {
    const fields: (keyof FormValues)[] = step === 0
      ? ['name', 'clientName', 'projectManagerId']
      : step === 1
      ? ['plannedStart', 'plannedEnd']
      : []
    const ok = await trigger(fields)
    if (!ok) return
    // Step 2 end-date validation
    if (step === 1) {
      const s = watch('plannedStart'), e = watch('plannedEnd')
      if (s && e && new Date(e) <= new Date(s)) return
    }
    setStep((v) => Math.min(v + 1, STEPS.length - 1))
  }

  const onSubmit = handleSubmit(async (v) => {
    const payload: CreateProjectPayload = {
      name: v.name.trim(),
      code: v.code.trim() || undefined,
      clientName: v.clientName.trim(),
      description: v.description.trim() || null,
      projectManagerId: v.projectManagerId,
      departmentId: v.departmentId || null,
      contractValue: v.contractValue ? Number(v.contractValue) : null,
      currency: v.currency,
      plannedStart: new Date(v.plannedStart).toISOString(),
      plannedEnd: new Date(v.plannedEnd).toISOString(),
      templateId: v.templateId || null,
    }
    const res = await createProject.mutateAsync(payload)
    close()
    router.push(`/projects/${res.id}`)
  })

  const startVal = watch('plannedStart')
  const endVal = watch('plannedEnd')
  const endBeforeStart = startVal && endVal && new Date(endVal) <= new Date(startVal)

  return (
    <Modal open={open} onClose={close} title="New Project" icon={FolderPlus} size="lg">
      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className={cn('flex size-6 items-center justify-center rounded-full text-body-sm font-semibold',
              i < step ? 'bg-primary-500 text-white' : i === step ? 'bg-primary-500 text-white' : 'bg-surface-muted text-ink-secondary')}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </div>
            <span className={cn('text-body-sm', i === step ? 'font-semibold text-ink-primary' : 'text-ink-secondary')}>{label}</span>
            {i < STEPS.length - 1 && <div className={cn('h-px flex-1', i < step ? 'bg-primary-500' : 'bg-surface-muted')} />}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Project Name" required error={errors.name?.message}>
              <input className="input" placeholder="e.g. Meda Platform"
                {...register('name', { required: 'Name is required', minLength: { value: 3, message: 'At least 3 characters' } })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
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
            <Field label="Description">
              <textarea rows={3} className="input" placeholder="Short description" {...register('description')} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Project Manager" required error={errors.projectManagerId?.message}>
                <select className="input" {...register('projectManagerId', { required: 'PM is required' })}>
                  {users.map((u) => (<option key={u.id} value={u.id}>{u.name ?? u.email}</option>))}
                </select>
              </Field>
              <Field label="Department">
                <select className="input" {...register('departmentId')}>
                  <option value="">— None —</option>
                  {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contract Value">
                <input type="number" min={0} step="any" className="input" placeholder="0" {...register('contractValue')} />
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
            <div className="grid grid-cols-2 gap-4">
              <Field label="Planned Start" required error={errors.plannedStart?.message}>
                <Controller
                  name="plannedStart"
                  control={control}
                  rules={{ required: 'Start date is required' }}
                  render={({ field }) => <ProjectDatePicker value={field.value} onChange={field.onChange} ariaLabel="Planned start date" allowClear={false} />}
                />
              </Field>
              <Field label="Planned End" required error={errors.plannedEnd?.message}>
                <Controller
                  name="plannedEnd"
                  control={control}
                  rules={{ required: 'End date is required' }}
                  render={({ field }) => <ProjectDatePicker value={field.value} onChange={field.onChange} ariaLabel="Planned end date" allowClear={false} />}
                />
              </Field>
            </div>
            {endBeforeStart && <p className="text-body-sm text-danger-600">End date must be after start date.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-body-sm text-ink-secondary">Start from a template to instantiate a standard delivery lifecycle, or start blank.</p>
            <label className={cn('flex cursor-pointer items-start gap-3 rounded-card border border-black/[0.06] p-3 transition-colors',
              watch('templateId') === '' ? 'bg-primary-50' : 'hover:bg-surface-hover')}>
              <input type="radio" value="" className="mt-1" {...register('templateId')} />
              <div>
                <div className="text-body font-medium text-ink-primary">Start blank</div>
                <div className="text-body-sm text-ink-secondary">Create an empty project and build the schedule yourself.</div>
              </div>
            </label>
            {(templates ?? []).map((t) => (
              <label key={t.id} className={cn('flex cursor-pointer items-start gap-3 rounded-card border border-black/[0.06] p-3 transition-colors',
                watch('templateId') === t.id ? 'bg-primary-50' : 'hover:bg-surface-hover')}>
                <input type="radio" value={t.id} className="mt-1" {...register('templateId')} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="size-4 text-primary-500" />
                    <span className="text-body font-medium text-ink-primary">{t.name}</span>
                    {t.isSystem && <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] text-ink-secondary">System</span>}
                  </div>
                  {t.description && <div className="text-body-sm text-ink-secondary">{t.description}</div>}
                  <div className="mt-1 text-body-sm text-ink-tertiary">{t.phases} phases · {t.milestones} milestones · {t.activities} activities</div>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <button type="button" className="btn btn-ghost" onClick={step === 0 ? close : () => setStep((v) => v - 1)}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={next}>Next →</button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={createProject.isPending}>
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
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
