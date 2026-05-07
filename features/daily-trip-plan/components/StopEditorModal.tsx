'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
  useEffect(() => { if (open) setForm(initialState) }, [open, initialState])

  // When the trip type changes and dwell is at the previous default, prefill
  // from the new default (mirrors FR-01 "pre-fills from trip type default;
  // editable").
  function setTripType(id: string) {
    const t = tripTypes.data?.find((x) => x.id === id)
    setForm((f) => ({
      ...f,
      tripTypeId: id,
      dwellMinutes: t ? t.defaultDwellMin : f.dwellMinutes,
    }))
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSubmit() {
    if (!form.destinationName.trim() || !form.destinationAddress.trim() || !form.reason.trim()) return
    if (form.dwellMinutes < 5) return
    await onSubmit(form)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? 'Edit stop' : 'Add stop'}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy}>{initial?.id ? 'Save changes' : 'Add stop'}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Where">
          <Field label="Destination">
            <Input value={form.destinationName} onChange={(e) => setField('destinationName', e.target.value)} placeholder="NBE — Tax Department" />
          </Field>
          <Field label="Address">
            <Input value={form.destinationAddress} onChange={(e) => setField('destinationAddress', e.target.value)} placeholder="Mexico Square, Addis Ababa" />
          </Field>
          <Field label="Contact person">
            <Input value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <Input value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} />
          </Field>
        </Section>

        <Section title="When">
          <Field label="Planned start">
            <Input type="time" value={form.plannedStart} onChange={(e) => setField('plannedStart', e.target.value)} />
          </Field>
          <Field label="Estimated wait time at destination (dwell)">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={5}
                step={15}
                className="w-24"
                value={form.dwellMinutes}
                onChange={(e) => setField('dwellMinutes', Math.max(5, Number(e.target.value)))}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {DWELL_QUICK.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setField('dwellMinutes', m)}
                  className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Flexibility">
            <SelectButtons value={form.flexibility} onChange={(v) => setField('flexibility', v)} options={FLEX_OPTIONS} />
          </Field>
        </Section>

        <Section title="How">
          <Field label="Trip mode">
            <SelectButtons value={form.tripMode} onChange={(v) => setField('tripMode', v)} options={TRIP_MODES} />
          </Field>
          {form.tripMode === 'ROUND_TRIP' && (
            <>
              <Field label="Where should the driver come back to?">
                <SelectButtons value={form.pickupBackTo} onChange={(v) => setField('pickupBackTo', v)} options={PICKUP_BACK} />
              </Field>
              {form.pickupBackTo === 'CUSTOM' && (
                <Field label="Custom return address">
                  <Input value={form.pickupBackAddress} onChange={(e) => setField('pickupBackAddress', e.target.value)} />
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
          <Field label="Reason">
            <Textarea rows={2} value={form.reason} onChange={(e) => setField('reason', e.target.value)} placeholder="What is the trip for?" />
          </Field>
          <Field label="Expected outcome">
            <Textarea rows={2} value={form.expectedOutcome} onChange={(e) => setField('expectedOutcome', e.target.value)} />
          </Field>
        </Section>

        <Section title="Logistics" className="md:col-span-2">
          <div className="flex flex-wrap items-center gap-6">
            <Label className="flex items-center gap-2">
              <Checkbox checked={form.requiresVehicle} onCheckedChange={(v) => setField('requiresVehicle', !!v)} />
              <span>Requires company vehicle</span>
            </Label>
            <Label className="flex items-center gap-2">
              <Checkbox checked={form.requiresCashAdvance} onCheckedChange={(v) => setField('requiresCashAdvance', !!v)} />
              <span>Requires cash advance</span>
            </Label>
            {form.requiresCashAdvance && (
              <Input
                type="number"
                min={0}
                placeholder="Amount (ETB)"
                className="w-32"
                value={form.cashAdvanceAmount}
                onChange={(e) => setField('cashAdvanceAmount', e.target.value === '' ? '' : Number(e.target.value))}
              />
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
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function SelectButtons({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={
            'rounded-md border px-3 py-1 text-sm transition ' +
            (value === o.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
