'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Gauge } from 'lucide-react'
import { Button, EntityPicker, Modal, type EntityPickerValue } from '@/components/ui'
import {
  KPI_DIRECTIONS,
  KPI_DIRECTION_LABELS,
  KPI_FREQUENCIES,
  KPI_FREQUENCY_LABELS,
  KPI_TYPES,
  KPI_TYPE_LABELS,
} from '@/types/package'
import { useCreateKpi, useUpdateKpi } from '../hooks/queries'
import { EMPTY_KPI_FORM, kpiFormSchema, kpiFormToPayload, type KpiFormValues } from '../services/schemas'
import { zodFormResolver } from '../services/zod-resolver'
import type { KpiView } from '../types'

interface KpiFormModalProps {
  open: boolean
  onClose: () => void
  /** Person the KPI belongs to (create). */
  ownerId: string
  /** Timeframe the KPI belongs to (create). */
  timeframeId: string
  /** Edit this KPI; omit to create. */
  kpi?: KpiView | null
  /** May mark the KPI sensitive (manager chain, ADMIN/EXEC). */
  canManageSensitive: boolean
  /** Frequency is locked once readings exist. */
  hasReadings?: boolean
  onSaved?: (kpi: KpiView) => void
}

function str(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function valuesFromKpi(kpi: KpiView): KpiFormValues {
  return {
    name: kpi.name,
    externalRef: kpi.externalRef ?? '',
    kpiType: kpi.kpiType,
    definition: kpi.definition,
    formula: kpi.formula ?? '',
    dataSource: kpi.dataSource ?? '',
    unit: kpi.unit,
    direction: kpi.direction,
    baselineText: kpi.baselineText ?? '',
    baselineValue: str(kpi.baselineValue),
    targetText: kpi.targetText,
    targetValue: str(kpi.targetValue),
    targetMin: str(kpi.targetMin),
    targetMax: str(kpi.targetMax),
    thresholdAmberPercent: String(Math.round(kpi.thresholdAmber * 1000) / 10),
    frequency: kpi.frequency,
    scoredFrom: kpi.scoredFrom ?? '',
    keyResultId: kpi.keyResultId ?? '',
    isSensitive: kpi.isSensitive,
    note: kpi.note ?? '',
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

function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-body-sm font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-caption text-muted-foreground">{hint}</p>}
      <FieldError message={error} />
    </div>
  )
}

/** Create / edit a KPI definition (KPI-1, KPI-2, KPI-6, KPI-7). */
export function KpiFormModal({
  open,
  onClose,
  ownerId,
  timeframeId,
  kpi,
  canManageSensitive,
  hasReadings = false,
  onSaved,
}: KpiFormModalProps) {
  const isEdit = Boolean(kpi)
  const create = useCreateKpi()
  const update = useUpdateKpi()
  const [krPick, setKrPick] = useState<EntityPickerValue | null>(null)

  const { register, control, handleSubmit, reset, watch, formState } = useForm<KpiFormValues>({
    resolver: zodFormResolver<KpiFormValues>(kpiFormSchema),
    defaultValues: kpi ? valuesFromKpi(kpi) : EMPTY_KPI_FORM,
  })

  useEffect(() => {
    if (!open) return
    reset(kpi ? valuesFromKpi(kpi) : EMPTY_KPI_FORM)
    setKrPick(
      kpi?.keyResult
        ? { kind: 'keyResult', id: kpi.keyResult.id, title: kpi.keyResult.title, objectiveId: '', objectiveTitle: '' }
        : null,
    )
  }, [open, kpi, reset])

  const direction = watch('direction')
  const errors = formState.errors
  const pending = create.isPending || update.isPending

  const onSubmit = handleSubmit(async (values) => {
    const payload = kpiFormToPayload(values)
    if (!canManageSensitive) payload.isSensitive = kpi?.isSensitive ?? false
    const saved = kpi
      ? await update.mutateAsync({
          id: kpi.id,
          body: hasReadings ? { ...payload, frequency: undefined } : payload,
        })
      : await create.mutateAsync({ ...payload, ownerId, timeframeId })
    onSaved?.(saved)
    onClose()
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit KPI' : 'Add KPI'}
      icon={Gauge}
      size="lg"
      scrollBehavior="internal"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add KPI'}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field id="kpi-name" label="Name" error={errors.name?.message}>
            <input id="kpi-name" className="input" placeholder="Win rate" {...register('name')} />
          </Field>
          <Field id="kpi-ref" label="Reference" error={errors.externalRef?.message}>
            <input id="kpi-ref" className="input" placeholder="EDN-K03" {...register('externalRef')} />
          </Field>
        </div>

        <Field id="kpi-definition" label="Definition" error={errors.definition?.message}>
          <textarea id="kpi-definition" rows={2} className="input h-auto" {...register('definition')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="kpi-type" label="Type">
            <select id="kpi-type" className="input" {...register('kpiType')}>
              {KPI_TYPES.map((t) => (
                <option key={t} value={t}>
                  {KPI_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="kpi-frequency"
            label="Reading frequency"
            hint={hasReadings ? 'Locked — readings exist' : 'Weekly = Mon–Sun · Quarterly = fiscal quarter'}
          >
            <select id="kpi-frequency" className="input" disabled={hasReadings} {...register('frequency')}>
              {KPI_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {KPI_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="kpi-unit" label="Unit" error={errors.unit?.message}>
            <input id="kpi-unit" className="input" placeholder="%, ETB, count, days" {...register('unit')} />
          </Field>
        </div>

        <fieldset className="space-y-4 rounded-[var(--ap-radius-md)] border p-4" style={{ borderColor: 'var(--ap-border)' }}>
          <legend className="px-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Target & scoring</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="kpi-direction" label="Direction">
              <select id="kpi-direction" className="input" {...register('direction')}>
                {KPI_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {KPI_DIRECTION_LABELS[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="kpi-target-text" label="Target (as written)" error={errors.targetText?.message}>
              <input id="kpi-target-text" className="input" placeholder="≥ 30%" {...register('targetText')} />
            </Field>
          </div>
          {direction === 'RANGE' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="kpi-target-min" label="Minimum" error={errors.targetMin?.message}>
                <input id="kpi-target-min" inputMode="decimal" className="input" {...register('targetMin')} />
              </Field>
              <Field id="kpi-target-max" label="Maximum" error={errors.targetMax?.message}>
                <input id="kpi-target-max" inputMode="decimal" className="input" {...register('targetMax')} />
              </Field>
            </div>
          ) : (
            <Field
              id="kpi-target-value"
              label="Numeric target"
              hint="Leave empty for text-only or compound KPIs — their RAG is set by hand."
              error={errors.targetValue?.message}
            >
              <input id="kpi-target-value" inputMode="decimal" className="input" {...register('targetValue')} />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="kpi-amber"
              label="Amber threshold (% of target)"
              hint="90 = within 10% of target counts as amber"
              error={errors.thresholdAmberPercent?.message}
            >
              <input id="kpi-amber" inputMode="decimal" className="input" {...register('thresholdAmberPercent')} />
            </Field>
            <Field
              id="kpi-scored-from"
              label="Scored from"
              hint="Earlier readings show as Measured (not scored)"
              error={errors.scoredFrom?.message}
            >
              <input id="kpi-scored-from" type="date" className="input" {...register('scoredFrom')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="kpi-baseline-text" label="Baseline (as written)">
              <input id="kpi-baseline-text" className="input" {...register('baselineText')} />
            </Field>
            <Field id="kpi-baseline-value" label="Baseline value" error={errors.baselineValue?.message}>
              <input id="kpi-baseline-value" inputMode="decimal" className="input" {...register('baselineValue')} />
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="kpi-formula" label="Formula">
            <input id="kpi-formula" className="input" {...register('formula')} />
          </Field>
          <Field id="kpi-source" label="Data source">
            <input id="kpi-source" className="input" {...register('dataSource')} />
          </Field>
        </div>

        <Field id="kpi-kr" label="Linked key result" hint="Optional. A linked KR can auto-fill readings from its current value.">
          <Controller
            control={control}
            name="keyResultId"
            render={({ field }) => (
              <EntityPicker
                value={krPick}
                onChange={(next) => {
                  setKrPick(next)
                  field.onChange(next?.id ?? '')
                }}
                selectable="keyResult"
                query={{ timeframeId }}
                recentKey="kpi-kr-picker-recent-v1"
                placeholder="Link to a key result…"
              />
            )}
          />
        </Field>

        {canManageSensitive && (
          <label className="flex items-start gap-2 text-body-sm text-foreground">
            <input type="checkbox" className="mt-0.5" {...register('isSensitive')} />
            <span>
              Sensitive KPI
              <span className="block text-caption text-muted-foreground">
                Quota or commission figures — visible only to the owner, their managers and Finance / Executive / Admin.
              </span>
            </span>
          </label>
        )}

        <Field id="kpi-note" label="Note">
          <textarea id="kpi-note" rows={2} className="input h-auto" {...register('note')} />
        </Field>
      </form>
    </Modal>
  )
}
