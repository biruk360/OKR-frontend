'use client'

/**
 * DependencyFormModal — raise a work dependency or edit one (DEP). Modal +
 * react-hook-form + zod. Providers ("Owner (delivers)") and needers ("Needed by")
 * are people pickers; OKR items are linked through the shared EntityPicker, and
 * links passed in (KPI, duty, task, development item) are kept and removable.
 *
 * The server decides who may save: anyone may raise one; edits are for the
 * creator, a party's managers, Exec and Admin. Callers open this in edit mode
 * only when the row's `permissions.canEdit` is true.
 */
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { GitPullRequestArrow, Link2, Lock, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterMultiSelect } from '@/components/ui/FilterMultiSelect'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { EntityPicker, type EntityPickerValue } from '@/components/ui/EntityPicker'
import { AppleDatePicker } from '@/components/ui/date-picker'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useTimeframes } from '@/hooks/useTimeframes'
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import {
  DEPENDENCY_LINK_ENTITY_TYPES,
  DEPENDENCY_TYPES,
  DEPENDENCY_TYPE_LABELS,
} from '@/types/package'
import {
  DEPENDENCY_PARTIES_MAX,
  DEPENDENCY_REF_MAX,
  DEPENDENCY_TEXT_MAX,
  DEPENDENCY_TITLE_MAX,
} from '../services/schemas'
import { useCreateDependency, useUpdateDependency } from '../hooks/queries'
import type { DependencyDetailRow, DependencyLinkedItem, DependencyWriteBody } from '../types'

const LINK_TYPE_LABELS: Record<(typeof DEPENDENCY_LINK_ENTITY_TYPES)[number], string> = {
  OBJECTIVE: 'Objective',
  KEY_RESULT: 'Key result',
  TODO: 'Task',
  KPI: 'KPI',
  DUTY: 'Duty',
  DEVELOPMENT: 'Development',
}

const linkSchema = z.object({
  entityType: z.enum(DEPENDENCY_LINK_ENTITY_TYPES),
  entityId: z.string().min(1),
  title: z.string().nullable(),
  ref: z.string().nullable(),
  redacted: z.boolean(),
})

const formSchema = z.object({
  timeframeId: z.string(),
  title: z.string().trim().min(1, 'Title is required').max(DEPENDENCY_TITLE_MAX),
  externalRef: z.string().trim().max(DEPENDENCY_REF_MAX),
  depType: z.enum(DEPENDENCY_TYPES),
  neededByDate: z.string(),
  unblocksText: z.string().trim().max(DEPENDENCY_TEXT_MAX),
  note: z.string().trim().max(DEPENDENCY_TEXT_MAX),
  providerIds: z
    .array(z.string())
    .min(1, 'Add at least one provider (who delivers)')
    .max(DEPENDENCY_PARTIES_MAX),
  neederIds: z.array(z.string()).min(1, 'Add at least one person who needs it').max(DEPENDENCY_PARTIES_MAX),
  links: z.array(linkSchema),
  createDeliveryTask: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>
type FormLink = FormValues['links'][number]

/** Zod → react-hook-form bridge (no @hookform/resolvers in this repo). */
const resolver: Resolver<FormValues> = async (values) => {
  const result = formSchema.safeParse(values)
  if (result.success) {
    if (result.data.createDeliveryTask && !result.data.neededByDate) {
      return {
        values: {},
        errors: { neededByDate: { type: 'custom', message: 'A delivery task needs a needed-by date' } } as FieldErrors<FormValues>,
      }
    }
    return { values: result.data, errors: {} }
  }
  const errors: Record<string, { type: string; message: string }> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'root')
    if (!errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors: errors as FieldErrors<FormValues> }
}

export interface DependencyFormDefaults {
  timeframeId?: string | null
  providerIds?: string[]
  neederIds?: string[]
  /** Prefilled linked items (e.g. raising a dependency from a KR or KPI). */
  links?: Array<Pick<DependencyLinkedItem, 'entityType' | 'entityId'> & Partial<Pick<DependencyLinkedItem, 'title' | 'ref' | 'redacted'>>>
}

export interface DependencyFormModalProps {
  open: boolean
  onClose: () => void
  /** Edit this dependency (PATCH). Omit to create. */
  dependency?: DependencyDetailRow | null
  /** Prefill for a new dependency. */
  defaults?: DependencyFormDefaults
  onSaved?: (dependency: DependencyDetailRow) => void
}

function toFormValues(dependency: DependencyDetailRow | null | undefined, defaults: DependencyFormDefaults | undefined): FormValues {
  if (dependency) {
    return {
      timeframeId: dependency.timeframe?.id ?? '',
      title: dependency.title,
      externalRef: dependency.ref ?? '',
      depType: dependency.depType,
      neededByDate: dependency.neededByDate ? dependency.neededByDate.slice(0, 10) : '',
      unblocksText: dependency.unblocksText ?? '',
      note: dependency.note ?? '',
      providerIds: dependency.providers.map((p) => p.id),
      neederIds: dependency.needers.map((p) => p.id),
      links: dependency.links.map((l) => ({
        entityType: l.entityType,
        entityId: l.entityId,
        title: l.title,
        ref: l.ref,
        redacted: l.redacted,
      })),
      createDeliveryTask: false,
    }
  }
  return {
    timeframeId: defaults?.timeframeId ?? '',
    title: '',
    externalRef: '',
    depType: 'OTHER',
    neededByDate: '',
    unblocksText: '',
    note: '',
    providerIds: defaults?.providerIds ?? [],
    neederIds: defaults?.neederIds ?? [],
    links: (defaults?.links ?? []).map((l) => ({
      entityType: l.entityType,
      entityId: l.entityId,
      title: l.title ?? null,
      ref: l.ref ?? null,
      redacted: l.redacted ?? false,
    })),
    createDeliveryTask: false,
  }
}

function toBody(values: FormValues, isEdit: boolean): DependencyWriteBody {
  const body: DependencyWriteBody = {
    title: values.title.trim(),
    externalRef: values.externalRef.trim() || null,
    depType: values.depType,
    neededByDate: values.neededByDate || null,
    unblocksText: values.unblocksText.trim() || null,
    note: values.note.trim() || null,
    providerIds: values.providerIds,
    neederIds: values.neederIds,
    links: values.links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
  }
  if (!isEdit) {
    if (values.timeframeId) body.timeframeId = values.timeframeId
    body.createDeliveryTask = values.createDeliveryTask
  }
  return body
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

function linkLabel(link: FormLink): string {
  if (link.redacted) return 'Private item'
  return [link.ref, link.title].filter(Boolean).join(' · ') || LINK_TYPE_LABELS[link.entityType]
}

export function DependencyFormModal({ open, onClose, dependency, defaults, onSaved }: DependencyFormModalProps) {
  const isEdit = !!dependency
  const { users } = useUsersForSelection({ enabled: open })
  const { timeframes } = useTimeframes({ enabled: open && !isEdit })
  const createMutation = useCreateDependency()
  const updateMutation = useUpdateDependency()
  const saving = createMutation.isPending || updateMutation.isPending
  const [okrPick, setOkrPick] = useState<EntityPickerValue | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver, defaultValues: toFormValues(dependency, defaults) })

  useEffect(() => {
    if (open) {
      reset(toFormValues(dependency, defaults))
      setOkrPick(null)
    }
    // Reset only when the dialog opens or the record changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dependency?.id])

  // Default the timeframe of a new dependency to the current one.
  const timeframeId = watch('timeframeId')
  useEffect(() => {
    if (!open || isEdit || timeframeId || timeframes.length === 0) return
    const current = pickCurrentTimeframe(timeframes)
    if (current) setValue('timeframeId', current.id)
  }, [open, isEdit, timeframeId, timeframes, setValue])

  const userOptions = useMemo(() => {
    const known = new Map<string, string>()
    for (const u of users) known.set(u.id, u.name ?? u.email)
    // Keep people already on the record selectable even if they left the active list.
    for (const p of [...(dependency?.providers ?? []), ...(dependency?.needers ?? [])]) {
      if (!known.has(p.id)) known.set(p.id, p.name ?? 'Former user')
    }
    return Array.from(known, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [users, dependency])

  const timeframeOptions = useMemo(
    () => timeframes.map((t) => ({ value: t.id, label: t.name })),
    [timeframes],
  )

  const links = watch('links')

  const addOkrLink = (value: EntityPickerValue | null) => {
    setOkrPick(null)
    if (!value) return
    const entityType = value.kind === 'objective' ? 'OBJECTIVE' : 'KEY_RESULT'
    const current = getValues('links')
    if (current.some((l) => l.entityType === entityType && l.entityId === value.id)) return
    setValue(
      'links',
      [...current, { entityType, entityId: value.id, title: value.title, ref: null, redacted: false }],
      { shouldDirty: true },
    )
  }

  const removeLink = (index: number) => {
    const current = getValues('links')
    setValue(
      'links',
      current.filter((_, i) => i !== index),
      { shouldDirty: true },
    )
  }

  const onSubmit = handleSubmit(async (values) => {
    const body = toBody(values, isEdit)
    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync({ id: dependency!.id, body })
        : (await createMutation.mutateAsync(body)).dependency
      onSaved?.(saved)
      onClose()
    } catch {
      // Toast shown by the mutation hook; keep the dialog open with the user's input.
    }
  })

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={isEdit ? 'Edit dependency' : 'New dependency'}
      icon={GitPullRequestArrow}
      size="lg"
      closeOnBackdrop={!isDirty}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="dependency-form" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create dependency'}
          </Button>
        </div>
      }
    >
      <form id="dependency-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="dependency-title">What is needed</Label>
          <Textarea
            id="dependency-title"
            rows={2}
            placeholder="e.g. World Bank project map: every active IDA/IBRD-financed project"
            {...register('title')}
            aria-invalid={!!errors.title}
          />
          <FieldError message={errors.title?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="dependency-ref">Reference</Label>
            <Input id="dependency-ref" placeholder="DEP14 or X03" {...register('externalRef')} />
            <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">X-ids mark package-specific links.</p>
            <FieldError message={errors.externalRef?.message} />
          </div>
          <div>
            <Label>Type</Label>
            <Controller
              control={control}
              name="depType"
              render={({ field }) => (
                <FilterSelect
                  label="Type"
                  value={field.value}
                  onValueChange={(v) => field.onChange(v || 'OTHER')}
                  options={DEPENDENCY_TYPES.map((t) => ({ value: t, label: DEPENDENCY_TYPE_LABELS[t] }))}
                  clearable={false}
                  className="w-full"
                />
              )}
            />
          </div>
          <div>
            <Label>Needed by</Label>
            <Controller
              control={control}
              name="neededByDate"
              render={({ field }) => (
                <AppleDatePicker value={field.value || null} onChange={(iso) => field.onChange(iso ?? '')} placeholder="No date" />
              )}
            />
            <FieldError message={errors.neededByDate?.message} />
          </div>
        </div>

        {!isEdit && timeframeOptions.length > 0 && (
          <div>
            <Label>Timeframe</Label>
            <Controller
              control={control}
              name="timeframeId"
              render={({ field }) => (
                <FilterSelect
                  label="Timeframe"
                  value={field.value}
                  onValueChange={(v) => field.onChange(v ?? '')}
                  options={timeframeOptions}
                  clearable={false}
                  className="w-full"
                />
              )}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Owner (delivers)</Label>
            <Controller
              control={control}
              name="providerIds"
              render={({ field }) => (
                <FilterMultiSelect
                  label="Providers"
                  values={field.value}
                  onValuesChange={field.onChange}
                  options={userOptions}
                  placeholder="Who delivers it"
                  className="w-full"
                />
              )}
            />
            <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">The first provider gets the delivery task.</p>
            <FieldError message={errors.providerIds?.message} />
          </div>
          <div>
            <Label>Needed by (people)</Label>
            <Controller
              control={control}
              name="neederIds"
              render={({ field }) => (
                <FilterMultiSelect
                  label="Needers"
                  values={field.value}
                  onValuesChange={field.onChange}
                  options={userOptions}
                  placeholder="Who waits on it"
                  className="w-full"
                />
              )}
            />
            <FieldError message={errors.neederIds?.message} />
          </div>
        </div>

        <div>
          <Label htmlFor="dependency-unblocks">Unblocks</Label>
          <Textarea id="dependency-unblocks" rows={2} placeholder="What this lets the needers do" {...register('unblocksText')} />
          <FieldError message={errors.unblocksText?.message} />
        </div>

        <div>
          <Label>Linked items</Label>
          {links.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {links.map((link, index) => (
                <li
                  key={`${link.entityType}:${link.entityId}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] py-0.5 pl-2 pr-1 text-caption"
                >
                  {link.redacted ? <Lock className="size-3 shrink-0" aria-hidden /> : <Link2 className="size-3 shrink-0" aria-hidden />}
                  <span className="text-[var(--ap-fg-subtle)]">{LINK_TYPE_LABELS[link.entityType]}:</span>
                  <span className="truncate">{linkLabel(link)}</span>
                  <button
                    type="button"
                    onClick={() => removeLink(index)}
                    className="ml-0.5 rounded-full p-0.5 text-[var(--ap-fg-subtle)] hover:bg-[var(--ap-bg-raised)] hover:text-[var(--ap-fg)] ap-focus-ring"
                    aria-label={`Remove ${linkLabel(link)}`}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <EntityPicker
            value={okrPick}
            onChange={addOkrLink}
            selectable="both"
            placeholder="Link an objective or key result…"
            recentKey="dependency-link-picker-recent-v1"
            disabledIds={links.filter((l) => l.entityType === 'OBJECTIVE' || l.entityType === 'KEY_RESULT').map((l) => l.entityId)}
          />
        </div>

        <div>
          <Label htmlFor="dependency-note">Note</Label>
          <Textarea id="dependency-note" rows={2} {...register('note')} />
          <FieldError message={errors.note?.message} />
        </div>

        {!isEdit && (
          <Controller
            control={control}
            name="createDeliveryTask"
            render={({ field }) => (
              <label className="flex items-start gap-2 text-body-sm">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
                <span>
                  Create a delivery task for the first provider, due on the needed-by date.
                  <span className="block text-caption text-[var(--ap-fg-subtle)]">
                    Completing the task does not close the dependency.
                  </span>
                </span>
              </label>
            )}
          />
        )}
      </form>
    </Modal>
  )
}
