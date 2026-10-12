'use client'

/**
 * Status dialogs for a development item:
 *  - MarkDevelopmentDoneDialog — DEV-2: certifications / courses need an
 *    evidence note or link; the completion date defaults to today.
 *  - DropDevelopmentItemDialog — DEV-5: a reason of at least 10 characters,
 *    kept on the item and in the activity log.
 *  - LogDevelopmentHoursDialog — POST …/hours (self-reported training hours).
 * Each is a Modal + react-hook-form + zod; the API enforces the same rules.
 */
import { useEffect } from 'react'
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { format } from 'date-fns'
import { Ban, CheckCircle2, Clock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  dropFormSchema,
  flatZodErrors,
  logHoursFormSchema,
  markDoneEvidenceError,
  markDoneFormSchema,
  type DropFormValues,
  type LogHoursFormValues,
  type MarkDoneFormValues,
} from '../services/form'
import { DROP_REASON_MIN, formatHours } from '../services/rules'
import { useAddDevelopmentHours, useUpdateDevelopmentItem } from '../hooks/queries'
import type { DevelopmentItemDTO } from '../types'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function DialogFooter({ formId, saving, label, onCancel, destructive }: {
  formId: string
  saving: boolean
  label: string
  onCancel: () => void
  destructive?: boolean
}) {
  return (
    <div className="flex w-full justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button type="submit" form={formId} disabled={saving} variant={destructive ? 'destructive' : 'default'}>
        {saving ? 'Saving…' : label}
      </Button>
    </div>
  )
}

interface ItemDialogProps {
  item: DevelopmentItemDTO | null
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mark done (DEV-2)
// ---------------------------------------------------------------------------

export function MarkDevelopmentDoneDialog({ item, onClose }: ItemDialogProps) {
  const mutation = useUpdateDevelopmentItem()
  const kind = item?.kind ?? 'OTHER'
  const resolver: Resolver<MarkDoneFormValues> = async (values) => {
    const result = markDoneFormSchema.safeParse(values)
    if (!result.success) return { values: {}, errors: flatZodErrors(result.error) as FieldErrors<MarkDoneFormValues> }
    const evidenceError = markDoneEvidenceError(kind, values)
    if (evidenceError) {
      const errors = { evidenceNote: { type: 'custom', message: evidenceError } } as FieldErrors<MarkDoneFormValues>
      return { values: {}, errors }
    }
    return { values, errors: {} }
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MarkDoneFormValues>({ resolver, defaultValues: { evidenceNote: '', evidenceUrl: '', completedAt: today() } })

  useEffect(() => {
    if (item) {
      reset({ evidenceNote: item.evidence.note ?? '', evidenceUrl: item.evidence.url ?? '', completedAt: today() })
    }
  }, [item, reset])

  const onSubmit = handleSubmit(async (values) => {
    if (!item) return
    const note = values.evidenceNote.trim() || null
    const url = values.evidenceUrl.trim() || null
    try {
      await mutation.mutateAsync({
        id: item.id,
        body: {
          status: 'DONE',
          completedAt: values.completedAt || null,
          ...(note !== (item.evidence.note ?? null) ? { evidenceNote: note } : {}),
          ...(url !== (item.evidence.url ?? null) ? { evidenceUrl: url } : {}),
        },
        successMessage: 'Marked done',
      })
      onClose()
    } catch {
      // Toast shown by the mutation hook.
    }
  })

  return (
    <Modal
      open={!!item}
      onClose={() => !mutation.isPending && onClose()}
      title="Mark as done"
      icon={CheckCircle2}
      size="md"
      footer={<DialogFooter formId="dev-done-form" saving={mutation.isPending} label="Mark done" onCancel={onClose} />}
    >
      <form id="dev-done-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-body-sm text-[var(--ap-fg-muted)]">
          <span className="font-medium text-[var(--ap-fg)]">{item?.title}</span>
          {item?.requiresEvidence
            ? ' — certifications and courses need an evidence note or link.'
            : ' — evidence is optional for this kind of item.'}
        </p>
        <div>
          <Label htmlFor="dev-done-note">Evidence note</Label>
          <Textarea
            id="dev-done-note"
            className="mt-1"
            rows={3}
            placeholder="e.g. Certificate no. 12345, issued 3 Mar 2027"
            aria-invalid={!!errors.evidenceNote}
            {...register('evidenceNote')}
          />
          <FieldError message={errors.evidenceNote?.message} />
        </div>
        <div>
          <Label htmlFor="dev-done-url">Evidence link</Label>
          <Input
            id="dev-done-url"
            className="mt-1"
            type="url"
            placeholder="https://…"
            aria-invalid={!!errors.evidenceUrl}
            {...register('evidenceUrl')}
          />
          <FieldError message={errors.evidenceUrl?.message} />
        </div>
        <div>
          <Label htmlFor="dev-done-date">Completed on</Label>
          <Input id="dev-done-date" className="mt-1" type="date" max={today()} {...register('completedAt')} />
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Drop (DEV-5)
// ---------------------------------------------------------------------------

const dropResolver: Resolver<DropFormValues> = async (values) => {
  const result = dropFormSchema.safeParse(values)
  if (result.success) return { values, errors: {} }
  return { values: {}, errors: flatZodErrors(result.error) as FieldErrors<DropFormValues> }
}

export function DropDevelopmentItemDialog({ item, onClose }: ItemDialogProps) {
  const mutation = useUpdateDevelopmentItem()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<DropFormValues>({ resolver: dropResolver, defaultValues: { dropReason: '' } })

  useEffect(() => {
    if (item) reset({ dropReason: '' })
  }, [item, reset])

  const length = (watch('dropReason') ?? '').trim().length

  const onSubmit = handleSubmit(async (values) => {
    if (!item) return
    try {
      await mutation.mutateAsync({
        id: item.id,
        body: { status: 'DROPPED', dropReason: values.dropReason.trim() },
        successMessage: 'Item dropped',
      })
      onClose()
    } catch {
      // Toast shown by the mutation hook.
    }
  })

  return (
    <Modal
      open={!!item}
      onClose={() => !mutation.isPending && onClose()}
      title="Drop development item"
      icon={Ban}
      size="md"
      footer={<DialogFooter formId="dev-drop-form" saving={mutation.isPending} label="Drop item" onCancel={onClose} destructive />}
    >
      <form id="dev-drop-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-body-sm text-[var(--ap-fg-muted)]">
          <span className="font-medium text-[var(--ap-fg)]">{item?.title}</span> will stay on the plan as dropped. Its hours no
          longer count toward the yearly rule. The reason is kept in the activity log.
        </p>
        <div>
          <Label htmlFor="dev-drop-reason">Reason</Label>
          <Textarea
            id="dev-drop-reason"
            className="mt-1"
            rows={3}
            placeholder="Why is this item no longer planned?"
            aria-invalid={!!errors.dropReason}
            {...register('dropReason')}
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            <FieldError message={errors.dropReason?.message} />
            <span className="ml-auto text-caption tabular-nums text-[var(--ap-fg-subtle)]">
              {length < DROP_REASON_MIN ? `${DROP_REASON_MIN - length} more characters` : `${length} characters`}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Log hours
// ---------------------------------------------------------------------------

const hoursResolver: Resolver<LogHoursFormValues> = async (values) => {
  const result = logHoursFormSchema.safeParse(values)
  if (result.success) return { values, errors: {} }
  return { values: {}, errors: flatZodErrors(result.error) as FieldErrors<LogHoursFormValues> }
}

export function LogDevelopmentHoursDialog({ item, onClose }: ItemDialogProps) {
  const mutation = useAddDevelopmentHours()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LogHoursFormValues>({ resolver: hoursResolver, defaultValues: { hours: '', date: today(), note: '' } })

  useEffect(() => {
    if (item) reset({ hours: '', date: today(), note: '' })
  }, [item, reset])

  const onSubmit = handleSubmit(async (values) => {
    if (!item) return
    try {
      await mutation.mutateAsync({
        id: item.id,
        body: { hours: Number(values.hours), date: values.date || null, note: values.note.trim() || null },
      })
      onClose()
    } catch {
      // Toast shown by the mutation hook.
    }
  })

  const target = item?.targetHours ? ` of ${formatHours(item.targetHours)} h` : ''

  return (
    <Modal
      open={!!item}
      onClose={() => !mutation.isPending && onClose()}
      title="Log training hours"
      icon={Clock}
      size="md"
      footer={<DialogFooter formId="dev-hours-form" saving={mutation.isPending} label="Log hours" onCancel={onClose} />}
    >
      <form id="dev-hours-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-body-sm text-[var(--ap-fg-muted)]">
          <span className="font-medium text-[var(--ap-fg)]">{item?.title}</span> — {formatHours(item?.hoursLogged)} h logged
          {target}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dev-hours-value">Hours</Label>
            <Input
              id="dev-hours-value"
              className="mt-1"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              autoFocus
              aria-invalid={!!errors.hours}
              {...register('hours')}
            />
            <FieldError message={errors.hours?.message} />
          </div>
          <div>
            <Label htmlFor="dev-hours-date">Spent on</Label>
            <Input id="dev-hours-date" className="mt-1" type="date" max={today()} {...register('date')} />
          </div>
        </div>
        <div>
          <Label htmlFor="dev-hours-note">Note</Label>
          <Input id="dev-hours-note" className="mt-1" placeholder="Optional, e.g. Module 3 of 8" {...register('note')} />
          <FieldError message={errors.note?.message} />
        </div>
      </form>
    </Modal>
  )
}
