'use client'

/**
 * DUT-3 "Log occurrence": a one-off duty to-do, due today by default, or
 * recorded as already done.
 */
import { useEffect } from 'react'
import { Controller, useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { z } from 'zod'
import { CalendarPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { parseDutyDate, toDutyDateKey } from '../services/schedule'
import { useLogDutyOccurrence } from '../hooks/queries'
import type { DutyDTO } from '../types'

const logFormSchema = z.object({
  dueDate: z.string().refine((v) => parseDutyDate(v) !== null, 'Pick a date'),
  completed: z.boolean(),
  note: z.string().max(2000, 'Keep the note under 2000 characters'),
})
type LogFormValues = z.infer<typeof logFormSchema>

const resolver: Resolver<LogFormValues> = async (values) => {
  const result = logFormSchema.safeParse(values)
  if (result.success) return { values, errors: {} }
  const errors: FieldErrors<LogFormValues> = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof LogFormValues | undefined
    if (key && !errors[key]) errors[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors }
}

function todayKey(): string {
  return toDutyDateKey(new Date()) as string
}

export interface LogOccurrenceModalProps {
  open: boolean
  onClose: () => void
  duty: DutyDTO | null
}

export function LogOccurrenceModal({ open, onClose, duty }: LogOccurrenceModalProps) {
  const logOccurrence = useLogDutyOccurrence()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LogFormValues>({ resolver, defaultValues: { dueDate: todayKey(), completed: false, note: '' } })

  useEffect(() => {
    if (open) reset({ dueDate: todayKey(), completed: false, note: '' })
  }, [open, reset])

  const onSubmit = handleSubmit(async (values) => {
    if (!duty) return
    try {
      await logOccurrence.mutateAsync({
        id: duty.id,
        dueDate: values.dueDate,
        completed: values.completed,
        note: values.note.trim() || null,
      })
      onClose()
    } catch {
      // Toast shown by the mutation.
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log occurrence"
      icon={CalendarPlus}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={logOccurrence.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={logOccurrence.isPending || !duty}>
            {logOccurrence.isPending ? 'Logging…' : 'Log occurrence'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        {duty && (
          <p className="text-body-sm text-[var(--ap-fg-secondary)]">
            <span className="font-semibold text-[var(--ap-fg)]">{duty.title}</span>
            {duty.eventLabel ? ` · ${duty.eventLabel}` : ''}
          </p>
        )}
        <div>
          <Label htmlFor="duty-log-date">Due</Label>
          <Input id="duty-log-date" type="date" {...register('dueDate')} aria-invalid={!!errors.dueDate} />
          {errors.dueDate?.message && (
            <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
              {errors.dueDate.message}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="completed"
            render={({ field }) => (
              <Checkbox id="duty-log-done" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
            )}
          />
          <Label htmlFor="duty-log-done">Already done — record it as completed</Label>
        </div>
        <div>
          <Label htmlFor="duty-log-note">Note</Label>
          <Textarea id="duty-log-note" rows={3} placeholder="Which bid, release or project?" {...register('note')} />
          {errors.note?.message && (
            <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
              {errors.note.message}
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}
