'use client'

/**
 * Create / edit a recurring duty (DUT-1…3, DUT-8).
 * react-hook-form + the zod `dutyFormSchema`; collaborators via
 * useUsersForSelection; linked KR (or objective) via EntityPicker.
 */
import { useEffect, useMemo } from 'react'
import { Controller, useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { CalendarClock, Repeat } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterMultiSelect } from '@/components/ui/FilterMultiSelect'
import { EntityPicker, type EntityPickerValue } from '@/components/ui/EntityPicker'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import { DUTY_CADENCES, DUTY_CADENCE_LABELS } from '@/types/package'
import { dutyFormSchema, type DutyFormValues } from '../services/schemas'
import { cadenceToRecurrenceRule, firstDutyOccurrence, parseDutyDate, sprintNumberFor } from '../services/schedule'
import type { DutyWriteBody } from '../services/api'
import { useCreateDuty, useUpdateDuty } from '../hooks/queries'
import type { DutyDTO } from '../types'

type FormShape = DutyFormValues & { link: EntityPickerValue | null }

/** Zod → react-hook-form bridge (no @hookform/resolvers in this repo; see SignUpForm). */
const resolver: Resolver<FormShape> = async (values) => {
  const result = dutyFormSchema.safeParse(values)
  if (result.success) return { values, errors: {} }
  const errors: FieldErrors<FormShape> = {}
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof FormShape | undefined
    if (key && !errors[key]) (errors as Record<string, unknown>)[key] = { type: issue.code, message: issue.message }
  }
  return { values: {}, errors }
}

const CADENCE_HINTS: Partial<Record<string, string>> = {
  EVERY_SPRINT: 'Every two weeks on the company sprint calendar (S1 starts Mon 12 Oct 2026).',
  EVENT: 'No automatic task. Use "Log occurrence" each time it happens.',
  QUARTERLY: 'Every three months, on the same day of the month.',
  SEMIANNUAL: 'Every six months, on the same day of the month.',
}

const fieldCls =
  'w-full rounded-[var(--ap-radius-sm)] border border-[var(--ap-border)] bg-[var(--ap-bg-raised)] px-3 py-2 text-body-sm text-[var(--ap-fg)] outline-none ap-focus-ring'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

function defaultsFor(duty: DutyDTO | null | undefined): FormShape {
  return {
    title: duty?.title ?? '',
    cadence: duty?.cadence ?? 'WEEKLY',
    eventLabel: duty?.eventLabel ?? '',
    timingText: duty?.timingText ?? '',
    durationMin: duty?.durationMin != null ? String(duty.durationMin) : '',
    outputText: duty?.outputText ?? '',
    autoTask: duty?.autoTask ?? true,
    startsOn: duty?.startsOn ?? '',
    endsOn: duty?.endsOn ?? '',
    collaboratorIds: duty?.collaborators.map((c) => c.id) ?? [],
    link: duty?.keyResult
      ? {
          kind: 'keyResult',
          id: duty.keyResult.id,
          title: duty.keyResult.title,
          objectiveId: duty.keyResult.objectiveId,
          objectiveTitle: '',
        }
      : duty?.objective
        ? {
            kind: 'objective',
            id: duty.objective.id,
            title: duty.objective.title,
            objectiveId: duty.objective.id,
            objectiveTitle: duty.objective.title,
          }
        : null,
  }
}

function formatPreview(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export interface DutyFormModalProps {
  open: boolean
  onClose: () => void
  /** The person the duty belongs to (create). */
  ownerId: string
  timeframeId: string
  /** Present = edit mode. */
  duty?: DutyDTO | null
}

export function DutyFormModal({ open, onClose, ownerId, timeframeId, duty }: DutyFormModalProps) {
  const isEdit = Boolean(duty)
  const createDuty = useCreateDuty()
  const updateDuty = useUpdateDuty()
  const { users, isLoading: usersLoading } = useUsersForSelection({ enabled: open })

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormShape>({ resolver, defaultValues: defaultsFor(duty) })

  useEffect(() => {
    if (open) reset(defaultsFor(duty))
  }, [open, duty, reset])

  const cadence = watch('cadence')
  const timingText = watch('timingText')
  const startsOn = watch('startsOn')
  const endsOn = watch('endsOn')
  const autoTask = watch('autoTask')
  const isEvent = cadence === 'EVENT'

  const preview = useMemo(() => {
    if (!autoTask || !cadenceToRecurrenceRule(cadence)) return null
    const first = firstDutyOccurrence({
      cadence,
      timingText,
      startsOn: parseDutyDate(startsOn),
      endsOn: parseDutyDate(endsOn),
      now: new Date(),
    })
    if (!first) return 'No date left before the end date — no task will be created.'
    const sprint = cadence === 'EVERY_SPRINT' ? ` (sprint S${sprintNumberFor(first)})` : ''
    return `First task due ${formatPreview(first)}${sprint}`
  }, [autoTask, cadence, timingText, startsOn, endsOn])

  const userOptions = useMemo(
    () =>
      users
        .filter((u) => u.id !== (duty?.ownerId ?? ownerId))
        .map((u) => ({
          value: u.id,
          label: u.name ?? u.email,
          hint: u.name ? u.email : undefined,
          leading: <UserAvatar user={{ id: u.id, name: u.name ?? u.email }} size={18} tooltip={false} />,
        })),
    [users, duty?.ownerId, ownerId],
  )

  const submitting = isSubmitting || createDuty.isPending || updateDuty.isPending

  const onSubmit = handleSubmit(async (values) => {
    const body: DutyWriteBody = {
      title: values.title.trim(),
      cadence: values.cadence,
      eventLabel: values.cadence === 'EVENT' ? values.eventLabel.trim() || null : null,
      timingText: values.timingText.trim() || null,
      durationMin: values.durationMin.trim() ? Number(values.durationMin) : null,
      outputText: values.outputText.trim() || null,
      autoTask: values.cadence === 'EVENT' ? false : values.autoTask,
      startsOn: values.startsOn || null,
      endsOn: values.endsOn || null,
      collaboratorIds: values.collaboratorIds,
      keyResultId: values.link?.kind === 'keyResult' ? values.link.id : null,
      objectiveId: values.link?.kind === 'objective' ? values.link.id : null,
    }
    try {
      if (duty) {
        await updateDuty.mutateAsync({ id: duty.id, body })
      } else {
        await createDuty.mutateAsync({ ...body, ownerId, timeframeId })
      }
      onClose()
    } catch {
      // Toast already shown by the mutation; keep the form open.
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit duty' : 'Add recurring duty'}
      icon={Repeat}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add duty'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <Label htmlFor="duty-title">Duty</Label>
          <Input id="duty-title" placeholder="e.g. Update the bid register" {...register('title')} aria-invalid={!!errors.title} />
          <FieldError message={errors.title?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="duty-cadence">Cadence</Label>
            <select id="duty-cadence" className={fieldCls} {...register('cadence')}>
              {DUTY_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {DUTY_CADENCE_LABELS[c]}
                </option>
              ))}
            </select>
            {CADENCE_HINTS[cadence] && (
              <p className="mt-1 text-caption text-[var(--ap-fg-muted)]">{CADENCE_HINTS[cadence]}</p>
            )}
            <FieldError message={errors.cadence?.message} />
          </div>
          {isEvent ? (
            <div>
              <Label htmlFor="duty-event">Happens</Label>
              <Input id="duty-event" placeholder="per bid, per release…" {...register('eventLabel')} />
              <FieldError message={errors.eventLabel?.message} />
            </div>
          ) : (
            <div>
              <Label htmlFor="duty-timing">Timing</Label>
              <Input id="duty-timing" placeholder="By 10:00 · First Saturday · 15th" {...register('timingText')} />
              <FieldError message={errors.timingText?.message} />
            </div>
          )}
        </div>

        {isEvent && (
          <div>
            <Label htmlFor="duty-timing-event">Timing</Label>
            <Input id="duty-timing-event" placeholder="Within 2 days of the event" {...register('timingText')} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <div>
            <Label htmlFor="duty-duration">Duration (min)</Label>
            <Input id="duty-duration" inputMode="numeric" placeholder="30" {...register('durationMin')} />
            <FieldError message={errors.durationMin?.message} />
          </div>
          <div>
            <Label htmlFor="duty-output">Output</Label>
            <Input id="duty-output" placeholder="e.g. Bid register entries" {...register('outputText')} />
            <FieldError message={errors.outputText?.message} />
          </div>
        </div>

        <div>
          <Label>With (collaborators)</Label>
          <Controller
            control={control}
            name="collaboratorIds"
            render={({ field }) => (
              <FilterMultiSelect
                label="With"
                values={field.value}
                onValuesChange={field.onChange}
                options={userOptions}
                placeholder={usersLoading ? 'Loading people…' : 'No one else'}
                summary={(selected) => `${selected.length} people`}
                menuWidth={300}
                className="w-full"
                triggerClassName="w-full justify-between"
              />
            )}
          />
          <p className="mt-1 text-caption text-[var(--ap-fg-muted)]">
            Collaborators are added to every task this duty creates (e.g. meeting attendees).
          </p>
          <FieldError message={errors.collaboratorIds?.message} />
        </div>

        <div>
          <Label>Linked key result</Label>
          <Controller
            control={control}
            name="link"
            render={({ field }) => (
              <EntityPicker
                value={field.value}
                onChange={field.onChange}
                selectable="both"
                query={{ timeframeId }}
                recentKey="duty-okr-link"
                placeholder="Optional — link to a key result or objective"
              />
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="duty-starts">Starts on</Label>
            <Input id="duty-starts" type="date" {...register('startsOn')} />
          </div>
          <div>
            <Label htmlFor="duty-ends">Ends on</Label>
            <Input id="duty-ends" type="date" {...register('endsOn')} aria-invalid={!!errors.endsOn} />
            <p className="mt-1 text-caption text-[var(--ap-fg-muted)]">Defaults to the end of the timeframe.</p>
            <FieldError message={errors.endsOn?.message} />
          </div>
        </div>

        {!isEvent && (
          <div
            className={cn(
              'flex items-start gap-3 rounded-[var(--ap-radius-md)] border border-[var(--ap-border)] bg-[var(--ap-bg-sunken)] p-3',
            )}
          >
            <Controller
              control={control}
              name="autoTask"
              render={({ field }) => (
                <Checkbox
                  id="duty-autotask"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="mt-0.5"
                />
              )}
            />
            <div className="min-w-0">
              <Label htmlFor="duty-autotask" className="font-semibold">
                Create recurring tasks automatically
              </Label>
              <p className="text-caption text-[var(--ap-fg-muted)]">
                A to-do appears on the owner&apos;s list for every occurrence. Duties never add to key result
                progress.
              </p>
              {preview && (
                <p className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-[var(--ap-fg-secondary)]">
                  <CalendarClock className="size-3.5" aria-hidden />
                  {preview}
                </p>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
