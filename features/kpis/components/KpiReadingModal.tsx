'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { PenLine } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { computeKpiRag } from '@/lib/kpi/rag'
import { formatKpiNumber } from '@/lib/kpi/stats'
import { KPI_RAGS, KPI_RAG_LABELS } from '@/types/package'
import { useKpiReadings, useSaveKpiReading } from '../hooks/queries'
import {
  kpiReadingFormSchema,
  kpiReadingFormToPayload,
  type KpiReadingFormValues,
} from '../services/schemas'
import { zodFormResolver } from '../services/zod-resolver'
import type { KpiReadingView, KpiView } from '../types'
import { KpiRagBadge } from './KpiRagBadge'
import { KpiSyncedLabel } from './KpiSyncedLabel'

interface KpiReadingModalProps {
  open: boolean
  kpi: KpiView | null
  onClose: () => void
  /** Period to preselect (`YYYY-MM-DD` start key). Defaults to the current period. */
  initialPeriodKey?: string | null
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium" style={{ color: 'var(--ap-danger-fg)' }} role="alert">
      {message}
    </p>
  )
}

function valuesFor(period: string, reading: KpiReadingView | undefined): KpiReadingFormValues {
  return {
    period,
    value: reading?.value != null ? String(reading.value) : '',
    valueText: reading?.valueText ?? '',
    rag: reading?.ragOverridden && reading.rag ? reading.rag : '',
    note: reading?.note ?? '',
  }
}

/** "Enter reading" (KPI-1): one reading per period; editing an existing one updates it (logged). */
export function KpiReadingModal({ open, kpi, onClose, initialPeriodKey }: KpiReadingModalProps) {
  const readingsQuery = useKpiReadings(open && kpi ? kpi.id : null)
  const save = useSaveKpiReading()
  const readings = useMemo(() => readingsQuery.data?.data ?? [], [readingsQuery.data])
  const periods = useMemo(() => {
    const list = readingsQuery.data?.enterablePeriods ?? []
    return list.length ? list : kpi ? [kpi.currentPeriod] : []
  }, [readingsQuery.data, kpi])
  const byPeriod = useMemo(() => new Map(readings.map((r) => [r.period.startKey, r])), [readings])

  // Synced KPIs (Odoo CRM): the value is the integration's; a manager may only override the RAG.
  const synced = Boolean(kpi?.externalSource)
  const canSetRag = kpi
    ? kpi.numericTarget || synced
      ? kpi.permissions.canOverrideRag
      : kpi.permissions.canEnterReading
    : false

  const defaultPeriod = initialPeriodKey ?? kpi?.currentPeriod.startKey ?? ''
  const form = useForm<KpiReadingFormValues>({
    resolver: zodFormResolver<KpiReadingFormValues>(kpiReadingFormSchema),
    defaultValues: valuesFor(defaultPeriod, undefined),
  })
  const { register, handleSubmit, reset, watch, formState } = form
  const period = watch('period')
  const valueRaw = watch('value')

  // Reset when the modal opens for a KPI, and prefill from the stored reading.
  useEffect(() => {
    if (!open || !kpi) return
    reset(valuesFor(defaultPeriod, byPeriod.get(defaultPeriod)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kpi?.id, defaultPeriod, readingsQuery.isSuccess])

  // Switching period loads that period's reading.
  useEffect(() => {
    if (!open || !period) return
    reset(valuesFor(period, byPeriod.get(period)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  if (!kpi) return null
  const existing = byPeriod.get(period)
  const numericValue = valueRaw.trim() === '' ? null : Number(valueRaw.replace(/,/g, ''))
  const previewRag = synced
    ? existing?.computedRag ?? null
    : kpi.numericTarget && numericValue !== null && Number.isFinite(numericValue)
      ? computeKpiRag(kpi, numericValue)
      : null

  const onSubmit = handleSubmit(async (values) => {
    await save.mutateAsync({ id: kpi.id, body: kpiReadingFormToPayload(values, { includeRag: canSetRag }) })
    onClose()
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={synced ? 'Override RAG' : existing ? 'Update reading' : 'Enter reading'}
      icon={PenLine}
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={save.isPending || formState.isSubmitting}>
            {save.isPending ? 'Saving…' : synced ? 'Save RAG' : existing ? 'Update reading' : 'Save reading'}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <p className="text-body font-semibold text-foreground">{kpi.name}</p>
          <p className="text-caption text-muted-foreground">Target: {kpi.targetText}</p>
        </div>

        <div>
          <label htmlFor="kpi-reading-period" className="mb-1 block text-body-sm font-medium text-muted-foreground">
            Period
          </label>
          <select id="kpi-reading-period" className="input" {...register('period')}>
            {periods.map((p) => (
              <option key={p.startKey} value={p.startKey}>
                {p.label}
                {byPeriod.has(p.startKey) ? ' · entered' : ''}
              </option>
            ))}
          </select>
          <FieldError message={formState.errors.period?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="kpi-reading-value" className="mb-1 block text-body-sm font-medium text-muted-foreground">
              Value{kpi.unit ? ` (${kpi.unit})` : ''}
            </label>
            <input
              id="kpi-reading-value"
              inputMode="decimal"
              className="input"
              placeholder="e.g. 42"
              readOnly={synced}
              aria-readonly={synced}
              {...register('value')}
            />
            <FieldError message={formState.errors.value?.message} />
          </div>
          <div>
            <label htmlFor="kpi-reading-text" className="mb-1 block text-body-sm font-medium text-muted-foreground">
              Text reading <span className="font-normal">(compound KPIs)</span>
            </label>
            <input
              id="kpi-reading-text"
              className="input"
              placeholder="100%; 100%; ≥30 qualified"
              readOnly={synced}
              aria-readonly={synced}
              {...register('valueText')}
            />
          </div>
        </div>

        {(kpi.numericTarget || synced) && (
          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            <span>{synced ? 'Synced RAG:' : 'Computed RAG:'}</span>
            {previewRag ? <KpiRagBadge rag={previewRag} /> : <span>—</span>}
            {numericValue !== null && Number.isFinite(numericValue) && (
              <span className="tabular-nums">({formatKpiNumber(numericValue, kpi.unit)})</span>
            )}
          </div>
        )}

        {canSetRag && (
          <div>
            <label htmlFor="kpi-reading-rag" className="mb-1 block text-body-sm font-medium text-muted-foreground">
              {kpi.numericTarget || synced ? 'Override RAG (manager)' : 'RAG (set manually for this KPI)'}
            </label>
            <select id="kpi-reading-rag" className="input" {...register('rag')}>
              <option value="">{synced ? 'Use synced RAG' : kpi.numericTarget ? 'Use computed RAG' : 'Not rated'}</option>
              {KPI_RAGS.map((rag) => (
                <option key={rag} value={rag}>
                  {KPI_RAG_LABELS[rag]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="kpi-reading-note" className="mb-1 block text-body-sm font-medium text-muted-foreground">
            Note
          </label>
          <textarea id="kpi-reading-note" rows={3} className="input h-auto" readOnly={synced} aria-readonly={synced} {...register('note')} />
        </div>

        {synced ? (
          <KpiSyncedLabel kpi={kpi} />
        ) : existing && (
          <p className="text-caption text-muted-foreground">
            Last entered {existing.enteredBy ? `by ${existing.enteredBy.name} ` : ''}on{' '}
            {new Date(existing.updatedAt).toLocaleDateString()} — saving replaces it and is logged.
          </p>
        )}
      </form>
    </Modal>
  )
}
