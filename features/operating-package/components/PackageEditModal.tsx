'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { PackageOpen } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { DEFAULT_PACKAGE_WEIGHTS, type PackageWeights } from '@/types/package'
import { useCreatePackage, useUpdatePackage } from '../hooks/queries'
import { packageEditFormSchema, type PackageEditFormValues } from '../services/schemas'
import { zodFormResolver } from '../services/zod-resolver'
import type { OperatingPackageDTO } from '../types'

export interface PackageEditModalProps {
  open: boolean
  onClose: () => void
  /** Edit this package; omit to create one for `userId` + `timeframeId`. */
  pkg?: OperatingPackageDTO | null
  userId: string
  timeframeId: string
  /** Show the performance-mix inputs (§8 `weights` edit). */
  allowWeights: boolean
}

const WEIGHT_FIELDS = [
  { key: 'kpis', label: 'KPIs' },
  { key: 'values', label: 'Values' },
  { key: 'okr', label: 'OKRs' },
  { key: 'development', label: 'Development' },
] as const

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-1 text-caption font-medium text-[var(--ap-danger-fg)]" role="alert">
      {message}
    </p>
  )
}

function weightString(weights: PackageWeights | null | undefined, key: string, fallback?: number): string {
  const value = weights?.[key]
  if (typeof value === 'number') return String(value)
  return fallback !== undefined ? String(fallback) : ''
}

function toFormValues(pkg: OperatingPackageDTO | null | undefined, allowWeights: boolean): PackageEditFormValues {
  const useDefaults = !pkg && allowWeights
  return {
    version: pkg?.version ?? 'v1',
    seatTitle: pkg?.seatTitle ?? '',
    summaryText: (pkg?.summaryLines ?? []).join('\n'),
    kpis: weightString(pkg?.weights, 'kpis', useDefaults ? DEFAULT_PACKAGE_WEIGHTS.kpis : undefined),
    values: weightString(pkg?.weights, 'values', useDefaults ? DEFAULT_PACKAGE_WEIGHTS.values : undefined),
    okr: weightString(pkg?.weights, 'okr', useDefaults ? DEFAULT_PACKAGE_WEIGHTS.okr : undefined),
    development: weightString(pkg?.weights, 'development', useDefaults ? DEFAULT_PACKAGE_WEIGHTS.development : undefined),
  }
}

function weightsFromForm(values: PackageEditFormValues): PackageWeights | null {
  const out: PackageWeights = {}
  for (const { key } of WEIGHT_FIELDS) {
    const raw = values[key].trim()
    if (raw !== '') out[key] = Number(raw)
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Create or edit the package header: version, seat title, "numbers this package commits to", performance mix. */
export function PackageEditModal({ open, onClose, pkg, userId, timeframeId, allowWeights }: PackageEditModalProps) {
  const create = useCreatePackage()
  const update = useUpdatePackage()
  const pending = create.isPending || update.isPending
  const form = useForm<PackageEditFormValues>({
    resolver: zodFormResolver<PackageEditFormValues>(packageEditFormSchema),
    defaultValues: toFormValues(pkg, allowWeights),
  })
  const { register, handleSubmit, reset, formState } = form

  useEffect(() => {
    if (open) reset(toFormValues(pkg, allowWeights))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id, pkg?.updatedAt, allowWeights])

  const onSubmit = handleSubmit(async (values) => {
    const summaryLines = values.summaryText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const seatTitle = values.seatTitle.trim() || null
    const weights = allowWeights ? weightsFromForm(values) : undefined
    try {
      if (pkg) {
        await update.mutateAsync({
          id: pkg.id,
          body: { version: values.version.trim(), seatTitle, summaryLines, ...(allowWeights ? { weights } : {}) },
        })
      } else {
        await create.mutateAsync({
          userId,
          timeframeId,
          version: values.version.trim(),
          seatTitle,
          summaryLines,
          ...(allowWeights && weights ? { weights } : {}),
        })
      }
      onClose()
    } catch {
      // Toast shown by the hook.
    }
  })

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title={pkg ? 'Edit operating package' : 'Create operating package'}
      icon={PackageOpen}
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending || formState.isSubmitting}>
            {pending ? 'Saving…' : pkg ? 'Save changes' : 'Create package'}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {!pkg && (
          <p className="text-body-sm text-[var(--ap-fg-muted)]">
            The package groups this person&apos;s OKRs, role, duties, KPIs, development plan and dependencies for the
            timeframe. Existing items are attached automatically. It starts as a draft.
          </p>
        )}
        {pkg?.status === 'APPROVED' && (
          <p className="rounded-[var(--ap-radius-md)] bg-[var(--ap-warn-bg)] p-3 text-body-sm text-[var(--ap-warn-fg)]">
            This package is approved. Changes are still allowed and are logged as &ldquo;edited after approval&rdquo;.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
          <div>
            <label htmlFor="pkg-version" className="mb-1 block text-body-sm font-medium text-[var(--ap-fg-muted)]">
              Version
            </label>
            <input id="pkg-version" className="input" placeholder="v1" {...register('version')} />
            <FieldError message={formState.errors.version?.message} />
          </div>
          <div>
            <label htmlFor="pkg-seat" className="mb-1 block text-body-sm font-medium text-[var(--ap-fg-muted)]">
              Seat title
            </label>
            <input id="pkg-seat" className="input" placeholder="e.g. Head of Sales" {...register('seatTitle')} />
            <FieldError message={formState.errors.seatTitle?.message} />
          </div>
        </div>
        <div>
          <label htmlFor="pkg-summary" className="mb-1 block text-body-sm font-medium text-[var(--ap-fg-muted)]">
            The numbers this package commits to <span className="font-normal">(one per line)</span>
          </label>
          <textarea id="pkg-summary" rows={4} className="input h-auto" {...register('summaryText')} />
          <FieldError message={formState.errors.summaryText?.message} />
        </div>
        {allowWeights && (
          <fieldset>
            <legend className="mb-1 block text-body-sm font-medium text-[var(--ap-fg-muted)]">
              Performance mix (%) <span className="font-normal">— informational until linked to a scorecard</span>
            </legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {WEIGHT_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label htmlFor={`pkg-weight-${key}`} className="mb-1 block text-caption text-[var(--ap-fg-subtle)]">
                    {label}
                  </label>
                  <input id={`pkg-weight-${key}`} inputMode="decimal" className="input" {...register(key)} />
                </div>
              ))}
            </div>
            <FieldError
              message={
                formState.errors.kpis?.message ??
                formState.errors.values?.message ??
                formState.errors.okr?.message ??
                formState.errors.development?.message
              }
            />
            <p className="mt-1 text-caption text-[var(--ap-fg-subtle)]">Leave all blank for no mix. Values must add up to 100.</p>
          </fieldset>
        )}
      </form>
    </Modal>
  )
}
