'use client'

/**
 * CheckpointEditor (KRX-3) — add, edit or review one KR checkpoint.
 *
 * Create mode (no `checkpoint`): label, due date, target text/value.
 * Edit mode: the same fields plus the review (Pending / Met / Missed with the
 * actual value) and Delete. `focus="review"` opens an existing checkpoint with
 * the review block first, for "mark MET / MISSED" from the strip.
 *
 * Saves through POST / PATCH / DELETE /api/keyresults/[id]/checkpoints.
 */
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { CheckCircle2, Flag, Sparkles, Trash2, XCircle } from 'lucide-react'
import { Button, ConfirmDialog, Input, Label, Modal, Textarea } from '@/components/ui'
import { AppleDatePicker } from '@/components/ui/date-picker'
import { cn } from '@/lib/utils'
import { CHECKPOINT_STATUSES, CHECKPOINT_STATUS_LABELS, type CheckpointStatus } from '@/types/package'
import {
  useCreateKrCheckpoint,
  useDeleteKrCheckpoint,
  useUpdateKrCheckpoint,
} from '../../hooks/useKrCheckpoints'
import type { KrCheckpointDTO } from './checkpoint-types'
import {
  CHECKPOINT_LABEL_MAX,
  CHECKPOINT_TARGET_TEXT_MAX,
  checkpointFormSchema,
  parseOptionalNumber,
  type CheckpointFormValues,
} from './checkpoint-schema'
import { checkpointDayKey, formatCheckpointValue, suggestCheckpointStatus } from './checkpoint-utils'
import { zodFormResolver } from './zod-form-resolver'

export interface CheckpointEditorProps {
  open: boolean
  onClose: () => void
  keyResultId: string
  /** Existing checkpoint to edit; omit to create one. */
  checkpoint?: KrCheckpointDTO | null
  /** Open an existing checkpoint with the review block first. */
  focus?: 'details' | 'review'
  /** KR direction — drives the MET / MISSED suggestion (KRX-1). */
  direction?: string | null
  /** KR unit, shown next to the numeric fields. */
  unit?: string | null
  /** Prefill for a new checkpoint (e.g. the next quarter label). */
  defaultLabel?: string
  canDelete?: boolean
  onSaved?: () => void
}

const STATUS_ICON: Record<CheckpointStatus, typeof Flag> = {
  PENDING: Flag,
  MET: CheckCircle2,
  MISSED: XCircle,
}

const STATUS_ACTIVE_STYLE: Record<CheckpointStatus, { background: string; color: string }> = {
  PENDING: { background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg)' },
  MET: { background: 'var(--ap-ok-bg)', color: 'var(--ap-ok-fg)' },
  MISSED: { background: 'var(--ap-danger-bg)', color: 'var(--ap-danger-fg)' },
}

function toFormValues(checkpoint: KrCheckpointDTO | null | undefined, defaultLabel?: string): CheckpointFormValues {
  if (!checkpoint) {
    return { label: defaultLabel ?? '', dueDate: '', targetText: '', targetValue: '', actualValue: '', status: 'PENDING' }
  }
  return {
    label: checkpoint.label,
    dueDate: checkpointDayKey(checkpoint.dueDate),
    targetText: checkpoint.targetText,
    targetValue: checkpoint.targetValue == null ? '' : String(checkpoint.targetValue),
    actualValue: checkpoint.actualValue == null ? '' : String(checkpoint.actualValue),
    status: checkpoint.status,
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium" style={{ color: 'var(--ap-danger-fg)' }} role="alert">
      {message}
    </p>
  )
}

export default function CheckpointEditor({
  open,
  onClose,
  keyResultId,
  checkpoint,
  focus = 'details',
  direction,
  unit,
  defaultLabel,
  canDelete = false,
  onSaved,
}: CheckpointEditorProps) {
  const isEdit = !!checkpoint
  const createMutation = useCreateKrCheckpoint(keyResultId)
  const updateMutation = useUpdateKrCheckpoint(keyResultId)
  const deleteMutation = useDeleteKrCheckpoint(keyResultId)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CheckpointFormValues>({
    resolver: zodFormResolver<CheckpointFormValues>(checkpointFormSchema),
    defaultValues: toFormValues(checkpoint, defaultLabel),
  })

  useEffect(() => {
    if (open) reset(toFormValues(checkpoint, defaultLabel))
  }, [open, checkpoint, defaultLabel, reset])

  const targetValue = watch('targetValue')
  const actualValue = watch('actualValue')
  const status = watch('status')
  const suggestion = useMemo(
    () =>
      suggestCheckpointStatus({
        targetValue: parseOptionalNumber(targetValue),
        actualValue: parseOptionalNumber(actualValue),
        direction,
      }),
    [targetValue, actualValue, direction],
  )

  const busy = isSubmitting || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending
  const unitLabel = unit?.trim() ? ` (${unit.trim()})` : ''
  const isDecrease = String(direction ?? '').toUpperCase() === 'DECREASE'

  const onSubmit = handleSubmit(async (values) => {
    const body = {
      label: values.label.trim(),
      dueDate: values.dueDate,
      targetText: values.targetText.trim(),
      targetValue: parseOptionalNumber(values.targetValue),
      actualValue: parseOptionalNumber(values.actualValue),
      status: values.status,
    }
    try {
      if (checkpoint) {
        await updateMutation.mutateAsync({ checkpointId: checkpoint.id, body })
      } else {
        await createMutation.mutateAsync(body)
      }
    } catch {
      return // the mutation toasts the error; keep the editor open
    }
    onSaved?.()
    onClose()
  })

  const handleDelete = async () => {
    if (!checkpoint) return
    try {
      await deleteMutation.mutateAsync(checkpoint.id)
    } catch {
      return
    }
    setConfirmDelete(false)
    onSaved?.()
    onClose()
  }

  const reviewBlock = (
    <fieldset className="space-y-3 rounded-[var(--ap-radius-md)] p-3" style={{ background: 'var(--ap-bg-sunken)' }}>
      <legend className="sr-only">Review</legend>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
          Review
        </span>
        {suggestion && suggestion !== status && (
          <button
            type="button"
            onClick={() => setValue('status', suggestion, { shouldDirty: true })}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium ap-focus-ring"
            style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent-on-soft)' }}
          >
            <Sparkles className="size-3" aria-hidden />
            Suggested: {CHECKPOINT_STATUS_LABELS[suggestion]}
          </button>
        )}
      </div>
      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <div role="radiogroup" aria-label="Checkpoint status" className="grid grid-cols-3 gap-1.5">
            {CHECKPOINT_STATUSES.map((s) => {
              const Icon = STATUS_ICON[s]
              const active = field.value === s
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => field.onChange(s)}
                  className={cn(
                    'inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--ap-radius-sm)] border text-body-sm font-medium transition-colors ap-focus-ring',
                    !active && 'hover:bg-[var(--ap-bg-hover)]',
                  )}
                  style={
                    active
                      ? { ...STATUS_ACTIVE_STYLE[s], borderColor: 'transparent' }
                      : { borderColor: 'var(--ap-border)', color: 'var(--ap-fg-muted)', background: 'var(--ap-bg-raised)' }
                  }
                >
                  <Icon className="size-3.5" aria-hidden />
                  {CHECKPOINT_STATUS_LABELS[s]}
                </button>
              )
            })}
          </div>
        )}
      />
      <div>
        <Label htmlFor="checkpoint-actual">Actual{unitLabel}</Label>
        <Input
          id="checkpoint-actual"
          inputMode="decimal"
          placeholder={isDecrease ? 'Measured value (lower is better)' : 'Measured value'}
          aria-invalid={!!errors.actualValue}
          className="mt-1"
          {...register('actualValue')}
        />
        <FieldError message={errors.actualValue?.message} />
        {status !== 'PENDING' && checkpoint?.reviewedAt && (
          <p className="mt-1 text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>
            Reviewed {new Date(checkpoint.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {checkpoint.reviewedBy?.name ? ` by ${checkpoint.reviewedBy.name}` : ''}
          </p>
        )}
      </div>
    </fieldset>
  )

  const detailsBlock = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)]">
        <div>
          <Label htmlFor="checkpoint-label">Label</Label>
          <Input
            id="checkpoint-label"
            placeholder="Q2"
            maxLength={CHECKPOINT_LABEL_MAX}
            aria-invalid={!!errors.label}
            className="mt-1"
            {...register('label')}
          />
          <FieldError message={errors.label?.message} />
        </div>
        <div>
          <Label>Due date</Label>
          <div className="mt-1">
            <Controller
              control={control}
              name="dueDate"
              render={({ field }) => (
                <AppleDatePicker value={field.value || null} onChange={(v) => field.onChange(v ?? '')} />
              )}
            />
          </div>
          <FieldError message={errors.dueDate?.message} />
        </div>
      </div>
      <div>
        <Label htmlFor="checkpoint-target-text">Target</Label>
        <Textarea
          id="checkpoint-target-text"
          rows={2}
          maxLength={CHECKPOINT_TARGET_TEXT_MAX}
          placeholder="What must be true at this checkpoint, as written"
          aria-invalid={!!errors.targetText}
          className="mt-1"
          {...register('targetText')}
        />
        <FieldError message={errors.targetText?.message} />
      </div>
      <div>
        <Label htmlFor="checkpoint-target-value">Target value{unitLabel}</Label>
        <Input
          id="checkpoint-target-value"
          inputMode="decimal"
          placeholder="Optional — enables the Met / Missed suggestion"
          aria-invalid={!!errors.targetValue}
          className="mt-1"
          {...register('targetValue')}
        />
        <FieldError message={errors.targetValue?.message} />
        {targetValue && !errors.targetValue && (
          <p className="mt-1 text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>
            {isDecrease ? 'Met when the actual is at or below ' : 'Met when the actual reaches '}
            {formatCheckpointValue(parseOptionalNumber(targetValue), unit)}
          </p>
        )}
      </div>
    </div>
  )

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <div>
        {isEdit && canDelete && (
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={busy}>
            <Trash2 className="size-3.5" aria-hidden />
            Delete
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" form="kr-checkpoint-form" disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save checkpoint' : 'Add checkpoint'}
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isEdit ? `Checkpoint ${checkpoint?.label ?? ''}`.trim() : 'Add checkpoint'}
        icon={Flag}
        size="md"
        footer={footer}
        closeOnBackdrop={!busy}
      >
        <form id="kr-checkpoint-form" onSubmit={onSubmit} className="space-y-4" noValidate>
          {isEdit && focus === 'review' ? (
            <>
              {reviewBlock}
              {detailsBlock}
            </>
          ) : (
            <>
              {detailsBlock}
              {isEdit && reviewBlock}
            </>
          )}
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete checkpoint?"
        message={`Checkpoint ${checkpoint?.label ?? ''} and its review will be removed from this key result.`}
        variant="danger"
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </>
  )
}
