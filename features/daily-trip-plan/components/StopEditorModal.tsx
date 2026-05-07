'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useTripTypes } from '../hooks/queries'
import type { DtpStop } from '../types'

interface FormState {
  destinationName: string
  destinationAddress: string
  contactPerson: string
  contactPhone: string
  plannedStart: string
  dwellMinutes: number
  flexibility: string
  tripMode: string
  pickupBackTo: string
  pickupBackAddress: string
  requiresVehicle: boolean
  requiresCashAdvance: boolean
  cashAdvanceAmount: number | ''
  reason: string
  expectedOutcome: string
  tripTypeId: string
}

type Errors = Partial<Record<keyof FormState, string>>

const FLEX_OPTIONS = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'FLEX_30', label: '± 30 min' },
  { value: 'FLEX_2H', label: '± 2 h' },
  { value: 'ANY_TIME', label: 'Any time today' },
]

const TRIP_MODES = [
  { value: 'ROUND_TRIP', label: 'Round trip' },
  { value: 'ONE_WAY', label: 'One way' },
]

const PICKUP_BACK = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'NEXT_STOP', label: 'Next stop' },
  { value: 'CUSTOM', label: 'Custom address' },
]

const DWELL_QUICK = [30, 60, 120, 180, 240]

interface Props {
  open: boolean
  onClose: () => void
  initial?: Partial<DtpStop> | null
  onSubmit: (state: FormState) => Promise<unknown> | unknown
  busy?: boolean
}

export function StopEditorModal({ open, onClose, initial, onSubmit, busy }: Props) {
  const tripTypes = useTripTypes()

  const initialState = useMemo<FormState>(() => ({
    destinationName: initial?.destinationName ?? '',
    destinationAddress: initial?.destinationAddress ?? '',
    contactPerson: initial?.contactPerson ?? '',
    contactPhone: initial?.contactPhone ?? '',
    plannedStart: initial?.plannedStart ?? '09:00',
    dwellMinutes: initial?.dwellMinutes ?? 60,
    flexibility: initial?.flexibility ?? 'FIXED',
    tripMode: initial?.tripMode ?? 'ROUND_TRIP',
    pickupBackTo: initial?.pickupBackTo ?? 'OFFICE',
    pickupBackAddress: initial?.pickupBackAddress ?? '',
    requiresVehicle: initial?.requiresVehicle ?? true,
    requiresCashAdvance: initial?.requiresCashAdvance ?? false,
    cashAdvanceAmount: initial?.cashAdvanceAmount ?? '',
    reason: initial?.reason ?? '',
    expectedOutcome: initial?.expectedOutcome ?? '',
    tripTypeId: initial?.tripTypeId ?? '',
  }), [initial])

  const [form, setForm] = useState<FormState>(initialState)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialState)
      setErrors({})
    }
  }, [open, initialState])

  function setTripType(id: string) {
    const t = tripTypes.data?.find((x) => x.id === id)
    setForm((f) => ({
      ...f,
      tripTypeId: id,
      // Pre-fill dwell from the selected type's default (FR-01).
      dwellMinutes: t ? t.defaultDwellMin : f.dwellMinutes,
    }))
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  function validate(): Errors {
    const errs: Errors = {}
    if (!form.destinationName.trim()) errs.destinationName = 'Destination is required'
    if (!form.destinationAddress.trim()) errs.destinationAddress = 'Address is required'
    if (!form.plannedStart || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.plannedStart)) errs.plannedStart = 'Time must be HH:MM (24h)'
    if (!Number.isFinite(form.dwellMinutes) || form.dwellMinutes < 5) errs.dwellMinutes = 'Dwell must be at least 5 minutes'
    if (!form.reason.trim()) errs.reason = 'Reason is required'
    if (form.tripMode === 'ROUND_TRIP' && form.pickupBackTo === 'CUSTOM' && !form.pickupBackAddress.trim()) {
      errs.pickupBackAddress = 'Custom return address is required'
    }
    if (form.requiresCashAdvance && (form.cashAdvanceAmount === '' || Number(form.cashAdvanceAmount) <= 0)) {
      errs.cashAdvanceAmount = 'Enter the cash advance amount'
    }
    return errs
  }

  async function handleSubmit() {
    if (submitting) return
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      toast.error('Please fix the highlighted fields')
      return
    }
    try {
      setSubmitting(true)
      await onSubmit(form)
    } catch (err) {
      // onSubmit's mutation hook already toasts on error; this is a backstop.
      console.error('[StopEditorModal] submit failed', err)
    } finally {
      setSubmitting(false)
    }
  }

  const isBusy = !!busy || submitting

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? 'Edit stop' : 'Add stop'}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isBusy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isBusy}>
            {isBusy ? 'Saving…' : initial?.id ? 'Save changes' : 'Add stop'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Where">
          <Field label="Destination" required error={errors.destinationName}>
            <Input
              value={form.destinationName}
              onChange={(e) => setField('destinationName', e.target.value)}
              placeholder="NBE — Tax Department"
              aria-invalid={!!errors.destinationName}
            />
          </Field>
          <Field label="Address" required error={errors.destinationAddress}>
            <Input
              value={form.destinationAddress}
              onChange={(e) => setField('destinationAddress', e.target.value)}
              placeholder="Mexico Square, Addis Ababa"
              aria-invalid={!!errors.destinationAddress}
            />
          </Field>
          <Field label="Contact person">
            <Input value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <Input value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} />
          </Field>
        </Section>

        <Section title="When">
          <Field label="Planned start" required error={errors.plannedStart}>
            <Input
              type="time"
              value={form.plannedStart}
              onChange={(e) => setField('plannedStart', e.target.value)}
              aria-invalid={!!errors.plannedStart}
            />
          </Field>
          <Field
            label="Estimated wait time at destination (dwell)"
            required
            error={errors.dwellMinutes}
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={5}
                step={15}
                className="w-24"
                value={form.dwellMinutes}
                onChange={(e) => setField('dwellMinutes', Math.max(5, Number(e.target.value) || 0))}
                aria-invalid={!!errors.dwellMinutes}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DWELL_QUICK.map((m) => (
                <PillButton
                  key={m}
                  selected={form.dwellMinutes === m}
                  onClick={() => setField('dwellMinutes', m)}
                  size="sm"
                >
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </PillButton>
              ))}
            </div>
          </Field>
          <Field label="Flexibility">
            <SegmentedControl
              value={form.flexibility}
              onChange={(v) => setField('flexibility', v)}
              options={FLEX_OPTIONS}
            />
          </Field>
        </Section>

        <Section title="How">
          <Field label="Trip mode" required>
            <SegmentedControl
              value={form.tripMode}
              onChange={(v) => setField('tripMode', v)}
              options={TRIP_MODES}
            />
          </Field>
          {form.tripMode === 'ROUND_TRIP' && (
            <>
              <Field label="Where should the driver come back to?">
                <SegmentedControl
                  value={form.pickupBackTo}
                  onChange={(v) => setField('pickupBackTo', v)}
                  options={PICKUP_BACK}
                />
              </Field>
              {form.pickupBackTo === 'CUSTOM' && (
                <Field label="Custom return address" required error={errors.pickupBackAddress}>
                  <Input
                    value={form.pickupBackAddress}
                    onChange={(e) => setField('pickupBackAddress', e.target.value)}
                    aria-invalid={!!errors.pickupBackAddress}
                  />
                </Field>
              )}
            </>
          )}
        </Section>

        <Section title="What">
          <Field label="Trip type">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.tripTypeId}
              onChange={(e) => setTripType(e.target.value)}
            >
              <option value="">— pick a type —</option>
              {tripTypes.data?.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Reason" required error={errors.reason}>
            <Textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setField('reason', e.target.value)}
              placeholder="What is the trip for?"
              aria-invalid={!!errors.reason}
            />
          </Field>
          <Field label="Expected outcome">
            <Textarea rows={2} value={form.expectedOutcome} onChange={(e) => setField('expectedOutcome', e.target.value)} />
          </Field>
        </Section>

        <Section title="Logistics" className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.requiresVehicle} onCheckedChange={(v) => setField('requiresVehicle', !!v)} />
              <span>Requires company vehicle</span>
            </Label>
            <Label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={form.requiresCashAdvance} onCheckedChange={(v) => setField('requiresCashAdvance', !!v)} />
              <span>Requires cash advance</span>
            </Label>
            {form.requiresCashAdvance && (
              <div>
                <Input
                  type="number"
                  min={0}
                  placeholder="Amount (ETB)"
                  className={cn('w-36', errors.cashAdvanceAmount && 'border-red-500')}
                  value={form.cashAdvanceAmount}
                  onChange={(e) => setField('cashAdvanceAmount', e.target.value === '' ? '' : Number(e.target.value))}
                  aria-invalid={!!errors.cashAdvanceAmount}
                />
                {errors.cashAdvanceAmount && (
                  <p className="text-xs text-red-600 mt-1">{errors.cashAdvanceAmount}</p>
                )}
              </div>
            )}
          </div>
        </Section>
      </div>
    </Modal>
  )
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="text-xs flex items-center gap-1">
        {label}
        {required && <span className="text-red-600" aria-hidden>*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

/** Segmented button group with a clearly visible selected state.
 * Uses explicit Tailwind colors (blue-600 / white) rather than the design
 * tokens so the highlight is always visible regardless of theme overrides. */
function SegmentedControl({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="inline-flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <PillButton
          key={o.value}
          selected={value === o.value}
          onClick={() => onChange(o.value)}
          role="radio"
          ariaChecked={value === o.value}
        >
          {o.label}
        </PillButton>
      ))}
    </div>
  )
}

function PillButton({
  selected,
  onClick,
  children,
  size = 'md',
  role,
  ariaChecked,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  size?: 'sm' | 'md'
  role?: string
  ariaChecked?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role={role}
      aria-checked={ariaChecked}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-medium transition-colors select-none',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        selected
          ? 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700'
          : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  )
}
