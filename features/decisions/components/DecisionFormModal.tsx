'use client'

/**
 * DecisionFormModal: request a decision, or edit an existing request.
 *
 * Fields: title, workbook ref, decider (default: company CEO), needed by,
 * batch, requested-by text, options / recommendation, what it unblocks, the
 * people it affects (USER links) and OKR items (OBJECTIVE / KEY_RESULT links).
 * Links to KPIs, duties, development items and dependencies made elsewhere
 * (importer, dependency forms) are kept as they are when editing.
 *
 * The server decides who may save: anyone may request; the requester, the
 * decider, an Executive or an Admin may edit; only a decider may reassign.
 */
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Scale, Target, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EntityPicker, type EntityPickerValue } from '@/components/ui/EntityPicker'
import { FilterMultiSelect } from '@/components/ui/FilterMultiSelect'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useTimeframes } from '@/hooks/useTimeframes'
import { cn } from '@/lib/utils'
import { useCreateDecision, useUpdateDecision } from '../hooks/queries'
import type { DecisionLinkBody } from '../services/api'
import {
  DECISION_BATCH_MAX,
  DECISION_LONG_TEXT_MAX,
  DECISION_REF_MAX,
  DECISION_REQUESTED_BY_TEXT_MAX,
  DECISION_TITLE_MAX,
} from '../services/schemas'
import { zodFormResolver } from '../services/zod-resolver'
import type { DecisionDTO } from '../types'

interface OkrLinkValue {
  entityType: 'OBJECTIVE' | 'KEY_RESULT'
  entityId: string
  label: string
}

const formSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(DECISION_TITLE_MAX),
  timeframeId: z.string(),
  externalRef: z.string().trim().max(DECISION_REF_MAX),
  deciderId: z.string().min(1, 'Choose who decides'),
  neededBy: z.string(),
  batch: z.string().trim().max(DECISION_BATCH_MAX),
  requestedByText: z.string().trim().max(DECISION_REQUESTED_BY_TEXT_MAX),
  optionsText: z.string().trim().max(DECISION_LONG_TEXT_MAX),
  unblocksText: z.string().trim().max(DECISION_LONG_TEXT_MAX),
  userIds: z.array(z.string()),
  okrLinks: z.array(z.object({ entityType: z.enum(['OBJECTIVE', 'KEY_RESULT']), entityId: z.string(), label: z.string() })),
})
type FormValues = z.infer<typeof formSchema>

const resolver = zodFormResolver(formSchema)

const selectClass =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none ap-focus-ring focus-visible:border-ring disabled:opacity-60 dark:bg-input/30'

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

export interface DecisionFormDefaults {
  timeframeId?: string | null
  deciderId?: string | null
  /** People the new decision affects (e.g. the profile's subject). */
  userIds?: string[]
  batch?: string | null
}

export interface DecisionFormModalProps {
  open: boolean
  onClose: () => void
  /** Edit this decision (PATCH); omit to request a new one (POST). */
  decision?: DecisionDTO | null
  /** Prefill for a new request. */
  defaults?: DecisionFormDefaults
  /** From the list API: OrganizationSettings.companyCeoUserId. */
  defaultDeciderId?: string | null
  onSaved?: (decisionId: string) => void
}

function toFormValues(decision: DecisionDTO | null | undefined, defaults: DecisionFormDefaults | undefined, defaultDeciderId: string | null | undefined): FormValues {
  if (decision) {
    return {
      title: decision.title,
      timeframeId: decision.timeframeId,
      externalRef: decision.externalRef ?? '',
      deciderId: decision.deciderId,
      neededBy: decision.neededBy ? decision.neededBy.slice(0, 10) : '',
      batch: decision.batch ?? '',
      requestedByText: decision.requestedByText ?? '',
      optionsText: decision.optionsText ?? '',
      unblocksText: decision.unblocksText ?? '',
      userIds: decision.links.filter((l) => l.entityType === 'USER').map((l) => l.entityId),
      okrLinks: decision.links
        .filter((l): l is typeof l & { entityType: 'OBJECTIVE' | 'KEY_RESULT' } => l.entityType === 'OBJECTIVE' || l.entityType === 'KEY_RESULT')
        .map((l) => ({
          entityType: l.entityType,
          entityId: l.entityId,
          label: l.redacted ? 'Private item' : l.title ?? 'Removed item',
        })),
    }
  }
  return {
    title: '',
    timeframeId: defaults?.timeframeId ?? '',
    externalRef: '',
    deciderId: defaults?.deciderId ?? defaultDeciderId ?? '',
    neededBy: '',
    batch: defaults?.batch ?? '',
    requestedByText: '',
    optionsText: '',
    unblocksText: '',
    userIds: defaults?.userIds ?? [],
    okrLinks: [],
  }
}

export function DecisionFormModal({ open, onClose, decision, defaults, defaultDeciderId, onSaved }: DecisionFormModalProps) {
  const isEdit = !!decision
  const { users, isLoading: usersLoading } = useUsersForSelection({ enabled: open })
  const { timeframes } = useTimeframes({ enabled: open && !isEdit })
  const createMutation = useCreateDecision()
  const updateMutation = useUpdateDecision()
  const saving = createMutation.isPending || updateMutation.isPending
  const [pickerValue, setPickerValue] = useState<EntityPickerValue | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver, defaultValues: toFormValues(decision, defaults, defaultDeciderId) })

  useEffect(() => {
    if (open) reset(toFormValues(decision, defaults, defaultDeciderId))
    // Reset only when the dialog opens or the decision changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, decision?.id])

  const okrLinks = watch('okrLinks')
  const deciderId = watch('deciderId')

  const userOptions = useMemo(
    () =>
      [...users]
        .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))
        .map((u) => ({ value: u.id, label: u.name ?? u.email })),
    [users],
  )
  // A decider who is no longer in the active list stays selectable.
  const missingDecider =
    deciderId && !userOptions.some((o) => o.value === deciderId) && decision?.decider?.id === deciderId ? decision.decider : null
  // Linked people who left keep their chip.
  const peopleOptions = useMemo(() => {
    const extra = (decision?.links ?? [])
      .filter((l) => l.entityType === 'USER' && !userOptions.some((o) => o.value === l.entityId))
      .map((l) => ({ value: l.entityId, label: l.title ?? 'Former user' }))
    return [...userOptions, ...extra]
  }, [decision?.links, userOptions])

  const canReassign = !isEdit || decision!.access.canDecide

  const addOkrLink = (value: EntityPickerValue | null) => {
    setPickerValue(null)
    if (!value) return
    const entityType = value.kind === 'objective' ? 'OBJECTIVE' : 'KEY_RESULT'
    if (okrLinks.some((l) => l.entityType === entityType && l.entityId === value.id)) return
    const next: OkrLinkValue = { entityType, entityId: value.id, label: value.title }
    setValue('okrLinks', [...okrLinks, next], { shouldDirty: true })
  }

  const onSubmit = handleSubmit(async (values) => {
    const otherLinks: DecisionLinkBody[] = (decision?.links ?? [])
      .filter((l) => l.entityType !== 'USER' && l.entityType !== 'OBJECTIVE' && l.entityType !== 'KEY_RESULT')
      .map((l) => ({ entityType: l.entityType, entityId: l.entityId }))
    const links: DecisionLinkBody[] = [
      ...values.userIds.map((id) => ({ entityType: 'USER' as const, entityId: id })),
      ...values.okrLinks.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
      ...otherLinks,
    ]
    const common = {
      title: values.title.trim(),
      externalRef: values.externalRef.trim() || null,
      neededBy: values.neededBy || null,
      batch: values.batch.trim() || null,
      requestedByText: values.requestedByText.trim() || null,
      optionsText: values.optionsText.trim() || null,
      unblocksText: values.unblocksText.trim() || null,
      links,
    }
    try {
      if (isEdit) {
        const saved = await updateMutation.mutateAsync({
          id: decision!.id,
          body: { ...common, ...(canReassign && values.deciderId !== decision!.deciderId ? { deciderId: values.deciderId } : {}) },
        })
        onSaved?.(saved.id)
      } else {
        const saved = await createMutation.mutateAsync({
          ...common,
          deciderId: values.deciderId,
          timeframeId: values.timeframeId || null,
        })
        onSaved?.(saved.id)
      }
      onClose()
    } catch {
      // The mutation hook shows the error; keep the dialog open with the input.
    }
  })

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={isEdit ? 'Edit decision request' : 'Request a decision'}
      icon={Scale}
      size="lg"
      closeOnBackdrop={!isDirty}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-[var(--ap-fg-subtle)]">
            {isEdit ? 'Changes are logged.' : 'The decider is notified and sees it under “Awaiting my decision”.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="decision-form" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Request decision'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="decision-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="decision-title">What needs deciding</Label>
          <Input
            id="decision-title"
            className="mt-1"
            placeholder="e.g. Approve the presales team structure"
            aria-invalid={!!errors.title}
            {...register('title')}
          />
          <FieldError message={errors.title?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="decision-decider">Decider</Label>
            <select
              id="decision-decider"
              className={cn(selectClass, 'mt-1')}
              disabled={usersLoading || !canReassign}
              aria-invalid={!!errors.deciderId}
              {...register('deciderId')}
            >
              <option value="">{usersLoading ? 'Loading people…' : 'Choose who decides'}</option>
              {missingDecider && <option value={missingDecider.id}>{missingDecider.name}</option>}
              {userOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.value === defaultDeciderId ? ' (CEO)' : ''}
                </option>
              ))}
            </select>
            <FieldError message={errors.deciderId?.message} />
            {!canReassign && (
              <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">Only the decider, an Executive or an Admin can reassign.</p>
            )}
          </div>
          <div>
            <Label htmlFor="decision-needed-by">Needed by</Label>
            <Input id="decision-needed-by" type="date" className="mt-1" {...register('neededBy')} />
          </div>
          <div>
            <Label htmlFor="decision-batch">Batch</Label>
            <Input id="decision-batch" className="mt-1" placeholder="e.g. 16 Oct" {...register('batch')} />
            <FieldError message={errors.batch?.message} />
          </div>
          <div>
            <Label htmlFor="decision-ref">Reference</Label>
            <Input id="decision-ref" className="mt-1" placeholder="e.g. D46" {...register('externalRef')} />
            <FieldError message={errors.externalRef?.message} />
          </div>
          {!isEdit && (
            <div>
              <Label htmlFor="decision-timeframe">Timeframe</Label>
              <select id="decision-timeframe" className={cn(selectClass, 'mt-1')} {...register('timeframeId')}>
                <option value="">Current timeframe</option>
                {timeframes.map((tf) => (
                  <option key={tf.id} value={tf.id}>
                    {tf.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={cn(isEdit && 'sm:col-span-2')}>
            <Label htmlFor="decision-requested-by">Requested by (note)</Label>
            <Input
              id="decision-requested-by"
              className="mt-1"
              placeholder="e.g. Meklit (structure)"
              {...register('requestedByText')}
            />
            <FieldError message={errors.requestedByText?.message} />
          </div>
        </div>

        <div>
          <Label htmlFor="decision-options">Options / recommendation</Label>
          <Textarea id="decision-options" rows={3} className="mt-1" {...register('optionsText')} />
          <FieldError message={errors.optionsText?.message} />
        </div>
        <div>
          <Label htmlFor="decision-unblocks">Unblocks</Label>
          <Textarea
            id="decision-unblocks"
            rows={2}
            className="mt-1"
            placeholder="Work that can start once this is decided."
            {...register('unblocksText')}
          />
          <FieldError message={errors.unblocksText?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>People affected</Label>
            <Controller
              control={control}
              name="userIds"
              render={({ field }) => (
                <FilterMultiSelect
                  className="mt-1"
                  label="People"
                  ariaLabel="People affected"
                  placeholder={usersLoading ? 'Loading people…' : 'Add people'}
                  values={field.value}
                  onValuesChange={field.onChange}
                  options={peopleOptions}
                  disabled={usersLoading}
                />
              )}
            />
            <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">They see it on their profile and are told when it is decided.</p>
          </div>
          <div>
            <Label>Linked OKRs</Label>
            <EntityPicker
              className="mt-1"
              value={pickerValue}
              onChange={addOkrLink}
              selectable="both"
              recentKey="decision-okr-links"
              placeholder="Link an objective or KR…"
              disabledIds={okrLinks.map((l) => l.entityId)}
            />
            {okrLinks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {okrLinks.map((link) => (
                  <li
                    key={`${link.entityType}:${link.entityId}`}
                    className="flex items-center gap-2 rounded-lg bg-[var(--ap-bg-sunken)] px-2 py-1 text-body-sm"
                  >
                    <Target className="size-3.5 shrink-0 text-[var(--ap-fg-subtle)]" aria-hidden />
                    <span className="text-caption text-[var(--ap-fg-subtle)]">{link.entityType === 'OBJECTIVE' ? 'Objective' : 'KR'}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--ap-fg)]">{link.label}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-[var(--ap-fg-subtle)] ap-focus-ring hover:text-[var(--ap-fg)]"
                      aria-label={`Remove ${link.label}`}
                      onClick={() =>
                        setValue(
                          'okrLinks',
                          okrLinks.filter((l) => !(l.entityType === link.entityType && l.entityId === link.entityId)),
                          { shouldDirty: true },
                        )
                      }
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </form>
    </Modal>
  )
}
