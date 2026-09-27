'use client'

import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { CalendarOff } from 'lucide-react'
import { Button, FilterSelect, Input, Label, Modal, Textarea } from '@/components/ui'
import { SCRUM_ABSENCE_TYPES } from '@/types/scrum'
import { useRecordScrumAbsence } from '../hooks/queries'

interface AbsenceFormValues {
  userId: string
  from: string
  to: string
  type: string
  reason: string
}

export interface ScrumAbsenceModalProps {
  open: boolean
  onClose: () => void
  currentUserId: string
  /** People the viewer may record absences for (proxy subjects = the same "manage" rule the route enforces). */
  subjects: Array<{ id: string; name?: string | null; email?: string | null }>
  defaultDate: string
}

/** Record an excused absence for self, or for a report (spec S10.2). Working days only — the route expands the range. */
export function ScrumAbsenceModal({ open, onClose, currentUserId, subjects, defaultDate }: ScrumAbsenceModalProps) {
  const record = useRecordScrumAbsence()
  const defaults = useMemo<AbsenceFormValues>(
    () => ({ userId: currentUserId, from: defaultDate, to: defaultDate, type: 'LEAVE', reason: '' }),
    [currentUserId, defaultDate],
  )
  const { control, register, handleSubmit, reset, watch, formState } = useForm<AbsenceFormValues>({ defaultValues: defaults })
  useEffect(() => { if (open) reset(defaults) }, [open, defaults, reset])
  const from = watch('from')

  const personOptions = useMemo(() => [
    { value: currentUserId, label: 'Me' },
    ...subjects.filter((s) => s.id !== currentUserId).map((s) => ({ value: s.id, label: s.name || s.email || 'Team member' })),
  ], [subjects, currentUserId])

  function submit(values: AbsenceFormValues) {
    record.mutate(
      {
        userId: values.userId,
        from: values.from,
        to: values.to || values.from,
        type: values.type,
        reason: values.reason.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Record absence" icon={CalendarOff} size="md">
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        {personOptions.length > 1 && (
          <Controller
            control={control}
            name="userId"
            render={({ field }) => (
              <FilterSelect
                label="Person"
                value={field.value}
                onValueChange={(value) => field.onChange(value ?? currentUserId)}
                options={personOptions}
                clearable={false}
                menuWidth={280}
                className="w-full"
              />
            )}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="absence-from">From</Label>
            <Input id="absence-from" type="date" {...register('from', { required: 'Start date is required' })} />
          </div>
          <div>
            <Label htmlFor="absence-to">To</Label>
            <Input
              id="absence-to"
              type="date"
              min={from}
              aria-invalid={!!formState.errors.to}
              {...register('to', { validate: (value) => !value || value >= from || 'End date must be on or after the start date' })}
            />
          </div>
        </div>
        {(formState.errors.from || formState.errors.to) && (
          <p className="text-body-sm text-danger-700">{formState.errors.from?.message ?? formState.errors.to?.message}</p>
        )}
        <Controller
          control={control}
          name="type"
          rules={{ required: true }}
          render={({ field }) => (
            <FilterSelect
              label="Type"
              value={field.value}
              onValueChange={(value) => field.onChange(value ?? 'LEAVE')}
              options={SCRUM_ABSENCE_TYPES.map((type) => ({ value: type, label: label(type) }))}
              clearable={false}
              className="w-full"
            />
          )}
        />
        <div>
          <Label htmlFor="absence-reason">Reason (optional)</Label>
          <Textarea id="absence-reason" rows={2} {...register('reason')} />
        </div>
        <p className="text-body-sm text-ink-secondary">Only working days are recorded. Excused days do not count against submission rate.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={record.isPending}>Save absence</Button>
        </div>
      </form>
    </Modal>
  )
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
