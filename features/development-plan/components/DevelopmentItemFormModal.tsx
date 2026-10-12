'use client'

/**
 * DevelopmentItemFormModal — add or edit a development item (DEV). Modal +
 * react-hook-form + zod. Status changes (done, drop, reopen) and adding hours
 * have their own dialogs (DevelopmentItemDialogs); this form edits the plan
 * fields, the evidence, and corrects the hours total.
 *
 * The server decides who may save (lib/package/access.ts 'development' edit);
 * callers only open this when the list API's `permissions` allow it.
 */
import { useEffect, useState } from 'react'
import { Controller, useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { GraduationCap } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { EntityPicker, type EntityPickerValue } from '@/components/ui/EntityPicker'
import { ConnectionsPanel } from '@/components/shared/connections'
import { cn } from '@/lib/utils'
import { DEVELOPMENT_KINDS, DEVELOPMENT_KIND_LABELS } from '@/types/package'
import {
  DEVELOPMENT_TARGET_HINTS,
  developmentItemFormSchema,
  flatZodErrors,
  toDevelopmentFormValues,
  toDevelopmentWriteBody,
  type DevelopmentItemFormValues,
} from '../services/form'
import { kindRequiresEvidence } from '../services/rules'
import { useCreateDevelopmentItem, useUpdateDevelopmentItem } from '../hooks/queries'
import type { DevelopmentItemDTO } from '../types'

const resolver: Resolver<DevelopmentItemFormValues> = async (values) => {
  const result = developmentItemFormSchema.safeParse(values)
  if (result.success) return { values, errors: {} }
  return { values: {}, errors: flatZodErrors(result.error) as FieldErrors<DevelopmentItemFormValues> }
}

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none ap-focus-ring focus-visible:border-ring dark:bg-input/30'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

function linkValueFor(item: DevelopmentItemDTO | null | undefined): EntityPickerValue | null {
  if (!item?.keyResult) return null
  return {
    kind: 'keyResult',
    id: item.keyResult.id,
    title: item.keyResult.title,
    objectiveId: item.keyResult.objectiveId ?? '',
    objectiveTitle: '',
  }
}

export interface DevelopmentItemFormModalProps {
  open: boolean
  onClose: () => void
  /** Whose plan the item belongs to. */
  ownerId: string
  /** Timeframe for a new item (ignored when editing). */
  timeframeId: string
  /** Edit this item (PATCH); omit to create (POST). */
  item?: DevelopmentItemDTO | null
  onSaved?: (item: DevelopmentItemDTO) => void
}

export function DevelopmentItemFormModal({ open, onClose, ownerId, timeframeId, item, onSaved }: DevelopmentItemFormModalProps) {
  const isEdit = !!item
  const createMutation = useCreateDevelopmentItem()
  const updateMutation = useUpdateDevelopmentItem()
  const saving = createMutation.isPending || updateMutation.isPending
  const [link, setLink] = useState<EntityPickerValue | null>(linkValueFor(item))

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<DevelopmentItemFormValues>({ resolver, defaultValues: toDevelopmentFormValues(item) })

  useEffect(() => {
    if (!open) return
    reset(toDevelopmentFormValues(item))
    setLink(linkValueFor(item))
    // Reset only when the dialog opens or the item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id])

  const kind = watch('kind')
  const needsEvidence = kindRequiresEvidence(kind)
  const isDone = item?.status === 'DONE'

  const onSubmit = handleSubmit(async (values) => {
    const body = toDevelopmentWriteBody(values, item)
    try {
      const saved = isEdit
        ? await updateMutation.mutateAsync({ id: item!.id, body })
        : await createMutation.mutateAsync({
            ...body,
            ownerId,
            timeframeId,
            title: values.title.trim(),
            kind: values.kind,
            targetText: values.targetText.trim(),
          })
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
      title={isEdit ? 'Edit development item' : 'Add development item'}
      icon={GraduationCap}
      size="lg"
      closeOnBackdrop={!isDirty}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-caption text-[var(--ap-fg-subtle)]">
            {needsEvidence
              ? 'Certifications and courses need evidence before they can be marked done.'
              : 'Hours on this item count toward the yearly training-hours rule.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="development-item-form" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="development-item-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="dev-title">Title</Label>
            <Input
              id="dev-title"
              className="mt-1"
              placeholder="e.g. Hardware/IoT architecture certification"
              aria-invalid={!!errors.title}
              {...register('title')}
            />
            <FieldError message={errors.title?.message} />
          </div>

          <div>
            <Label htmlFor="dev-kind">Kind</Label>
            <select
              id="dev-kind"
              className={cn(selectClass, 'mt-1')}
              {...register('kind', {
                onChange: (event) => {
                  const next = event.target.value as DevelopmentItemFormValues['kind']
                  if (!getValues('targetText').trim() && DEVELOPMENT_TARGET_HINTS[next]) {
                    setValue('targetText', DEVELOPMENT_TARGET_HINTS[next], { shouldDirty: true })
                  }
                },
              })}
            >
              {DEVELOPMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DEVELOPMENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="dev-target">Target</Label>
            <Input
              id="dev-target"
              className="mt-1"
              placeholder={DEVELOPMENT_TARGET_HINTS[kind] ?? 'Done'}
              aria-invalid={!!errors.targetText}
              {...register('targetText')}
            />
            <FieldError message={errors.targetText?.message} />
          </div>

          <div>
            <Label htmlFor="dev-target-hours">Target hours</Label>
            <Input
              id="dev-target-hours"
              className="mt-1"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              placeholder="Optional"
              aria-invalid={!!errors.targetHours}
              {...register('targetHours')}
            />
            <FieldError message={errors.targetHours?.message} />
          </div>

          <div>
            <Label htmlFor="dev-due">Due date</Label>
            <Input id="dev-due" className="mt-1" type="date" {...register('dueDate')} />
          </div>

          <div>
            <Label htmlFor="dev-hours">{isEdit ? 'Hours logged (correction)' : 'Hours already logged'}</Label>
            <Input
              id="dev-hours"
              className="mt-1"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              placeholder="0"
              aria-invalid={!!errors.hoursLogged}
              {...register('hoursLogged')}
            />
            <FieldError message={errors.hoursLogged?.message} />
            {isEdit && (
              <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">Use “Log hours” to add time; edit here only to correct the total.</p>
            )}
          </div>

          <div>
            <Label htmlFor="dev-ref">Reference</Label>
            <Input id="dev-ref" className="mt-1" placeholder="Optional, e.g. DV1" aria-invalid={!!errors.externalRef} {...register('externalRef')} />
            <FieldError message={errors.externalRef?.message} />
          </div>

          <div className="sm:col-span-2">
            <Label>Linked key result</Label>
            <div className="mt-1">
              <EntityPicker
                value={link}
                onChange={(value) => {
                  setLink(value)
                  setValue('keyResultId', value?.id ?? '', { shouldDirty: true })
                }}
                selectable="keyResult"
                query={{ timeframeId, ownerId }}
                recentKey="development-item-kr-link"
                placeholder="Optional — the key result this item supports"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 sm:col-span-2">
            <Controller
              control={control}
              name="isMandatory"
              render={({ field }) => (
                <Checkbox
                  id="dev-mandatory"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
              )}
            />
            <div>
              <Label htmlFor="dev-mandatory">Mandatory</Label>
              <p className="text-caption text-[var(--ap-fg-subtle)]">Part of the required yearly development plan.</p>
            </div>
          </div>
        </div>

        <fieldset className="space-y-3 rounded-card border border-[var(--ap-border)] p-4">
          <legend className="px-1 text-body-sm font-semibold text-[var(--ap-fg)]">
            Evidence{needsEvidence ? (isDone ? ' (required — the item is done)' : ' (needed before done)') : ' (optional)'}
          </legend>
          <div>
            <Label htmlFor="dev-evidence-note">Note</Label>
            <Textarea
              id="dev-evidence-note"
              className="mt-1"
              rows={3}
              placeholder="e.g. Certificate no. 12345, issued 3 Mar 2027"
              aria-invalid={!!errors.evidenceNote}
              {...register('evidenceNote')}
            />
            <FieldError message={errors.evidenceNote?.message} />
          </div>
          <div>
            <Label htmlFor="dev-evidence-url">Link</Label>
            <Input
              id="dev-evidence-url"
              className="mt-1"
              type="url"
              placeholder="https://… (certificate, transcript or shared file)"
              aria-invalid={!!errors.evidenceUrl}
              {...register('evidenceUrl')}
            />
            <FieldError message={errors.evidenceUrl?.message} />
          </div>
        </fieldset>
      </form>

      {/* CON-2: what this development item is connected to (linked KR, dependencies, decisions). */}
      {isEdit && item && (
        <ConnectionsPanel
          entityType="DEVELOPMENT"
          entityId={item.id}
          variant="section"
          className="mt-5"
          emptyText="Nothing is linked to this item yet."
        />
      )}
    </Modal>
  )
}
