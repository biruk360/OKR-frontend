'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useDtpSettings, useUpdateSettings } from '../hooks/queries'
import type { DtpSettings } from '../types'

/**
 * Org-wide DTP settings form (admin-only). Renders sections matching spec
 * §4 (Approval routing, SLAs, Working hours / geofence, Traffic, Optimization,
 * Adjustment ack, Pool/Ops users, Notifications). Per-department approval
 * routing is wired separately further down.
 */
export function TravelSettingsForm() {
  const { data, isLoading } = useDtpSettings()
  const update = useUpdateSettings()
  const [form, setForm] = useState<Partial<DtpSettings>>({})

  useEffect(() => { if (data?.settings) setForm(data.settings) }, [data?.settings])

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (!data) return <div className="p-6 text-sm text-red-700">Failed to load.</div>

  function set<K extends keyof DtpSettings>(k: K, v: DtpSettings[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function saveSection(keys: (keyof DtpSettings)[]) {
    const patch: Partial<DtpSettings> = {}
    for (const k of keys) (patch as Record<string, unknown>)[k] = form[k]
    update.mutate({ settings: patch })
  }

  return (
    <div className="space-y-4">
      <Section title="SLAs">
        <Field label="Submission cutoff (HH:MM)">
          <Input value={form.submissionCutoff ?? ''} onChange={(e) => set('submissionCutoff', e.target.value)} />
        </Field>
        <Field label="Approval SLA — same-day-of-trip (HH:MM)">
          <Input value={form.approvalSlaTime ?? ''} onChange={(e) => set('approvalSlaTime', e.target.value)} />
        </Field>
        <SaveBar onSave={() => saveSection(['submissionCutoff', 'approvalSlaTime'])} busy={update.isPending} />
      </Section>

      <Section title="Working hours, geofence & defaults">
        <Field label="Office label">
          <Input value={form.officeLabel ?? ''} onChange={(e) => set('officeLabel', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Office latitude">
            <Input type="number" step="any" value={form.officeAnchorLat ?? 0} onChange={(e) => set('officeAnchorLat', Number(e.target.value))} />
          </Field>
          <Field label="Office longitude">
            <Input type="number" step="any" value={form.officeAnchorLng ?? 0} onChange={(e) => set('officeAnchorLng', Number(e.target.value))} />
          </Field>
          <Field label="Work start (HH:MM)">
            <Input value={form.workStart ?? ''} onChange={(e) => set('workStart', e.target.value)} />
          </Field>
          <Field label="Work end (HH:MM)">
            <Input value={form.workEnd ?? ''} onChange={(e) => set('workEnd', e.target.value)} />
          </Field>
          <Field label="“Same area” radius (m)">
            <Input type="number" min={50} value={form.sameAreaRadiusM ?? 800} onChange={(e) => set('sameAreaRadiusM', Number(e.target.value))} />
          </Field>
          <Field label="Default trip mode">
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.defaultTripMode ?? 'ROUND_TRIP'} onChange={(e) => set('defaultTripMode', e.target.value)}>
              <option value="ROUND_TRIP">Round trip</option>
              <option value="ONE_WAY">One way</option>
            </select>
          </Field>
        </div>
        <SaveBar onSave={() => saveSection(['officeLabel', 'officeAnchorLat', 'officeAnchorLng', 'workStart', 'workEnd', 'sameAreaRadiusM', 'defaultTripMode'])} busy={update.isPending} />
      </Section>

      <Section title="Traffic & routing">
        <Label className="flex items-center gap-2">
          <Checkbox checked={!!form.trafficAware} onCheckedChange={(v) => set('trafficAware', !!v)} />
          <span>Traffic-aware estimates</span>
        </Label>
        <Field label="Traffic model">
          <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.trafficModel ?? 'best_guess'} onChange={(e) => set('trafficModel', e.target.value)}>
            <option value="best_guess">best_guess</option>
            <option value="optimistic">optimistic</option>
            <option value="pessimistic">pessimistic</option>
          </select>
        </Field>
        <Field label="Traffic buffer (%)">
          <Input type="number" min={0} max={100} value={form.trafficBufferPct ?? 10} onChange={(e) => set('trafficBufferPct', Number(e.target.value))} />
        </Field>
        <SaveBar onSave={() => saveSection(['trafficAware', 'trafficModel', 'trafficBufferPct'])} busy={update.isPending} />
      </Section>

      <Section title="Route optimization">
        <Label className="flex items-center gap-2">
          <Checkbox checked={!!form.optimizationEnabled} onCheckedChange={(v) => set('optimizationEnabled', !!v)} />
          <span>Optimization enabled</span>
        </Label>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Max group size">
            <Input type="number" min={2} max={10} value={form.optimizationMaxGroupSize ?? 4} onChange={(e) => set('optimizationMaxGroupSize', Number(e.target.value))} />
          </Field>
          <Field label="Max detour (min)">
            <Input type="number" min={0} value={form.optimizationMaxDetourMin ?? 15} onChange={(e) => set('optimizationMaxDetourMin', Number(e.target.value))} />
          </Field>
          <Field label="Max passengers / vehicle">
            <Input type="number" min={1} value={form.optimizationMaxPassengersPerVehicle ?? 4} onChange={(e) => set('optimizationMaxPassengersPerVehicle', Number(e.target.value))} />
          </Field>
        </div>
        <SaveBar onSave={() => saveSection(['optimizationEnabled', 'optimizationMaxGroupSize', 'optimizationMaxDetourMin', 'optimizationMaxPassengersPerVehicle'])} busy={update.isPending} />
      </Section>

      <Section title="Adjustments & acknowledgement">
        <Label className="flex items-center gap-2">
          <Checkbox checked={!!form.adjustmentRequiresAcknowledgement} onCheckedChange={(v) => set('adjustmentRequiresAcknowledgement', !!v)} />
          <span>Coordinator adjustments require requester acknowledgement</span>
        </Label>
        <SaveBar onSave={() => saveSection(['adjustmentRequiresAcknowledgement'])} busy={update.isPending} />
      </Section>

      <Section title="Pool / Operations user lists (CSV of user IDs)">
        <Field label="Pool Coordinator user IDs">
          <Input value={form.poolCoordinatorIds ?? ''} onChange={(e) => set('poolCoordinatorIds', e.target.value)} placeholder="id1,id2" />
        </Field>
        <Field label="Operations Manager user IDs">
          <Input value={form.operationsManagerIds ?? ''} onChange={(e) => set('operationsManagerIds', e.target.value)} placeholder="id1,id2" />
        </Field>
        <SaveBar onSave={() => saveSection(['poolCoordinatorIds', 'operationsManagerIds'])} busy={update.isPending} />
      </Section>

      <Section title="Notification channels">
        <div className="flex flex-wrap gap-4">
          <Label className="flex items-center gap-2"><Checkbox checked={!!form.notifyInApp} onCheckedChange={(v) => set('notifyInApp', !!v)} />In-app</Label>
          <Label className="flex items-center gap-2"><Checkbox checked={!!form.notifyEmail} onCheckedChange={(v) => set('notifyEmail', !!v)} />Email</Label>
          <Label className="flex items-center gap-2"><Checkbox checked={!!form.notifySms} onCheckedChange={(v) => set('notifySms', !!v)} />SMS (TODO)</Label>
          <Label className="flex items-center gap-2"><Checkbox checked={!!form.notifyTelegram} onCheckedChange={(v) => set('notifyTelegram', !!v)} />Telegram (TODO)</Label>
        </div>
        <SaveBar onSave={() => saveSection(['notifyInApp', 'notifyEmail', 'notifySms', 'notifyTelegram'])} busy={update.isPending} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
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
function SaveBar({ onSave, busy }: { onSave: () => void; busy?: boolean }) {
  return (
    <div className="pt-1">
      <Button size="sm" variant="outline" onClick={onSave} disabled={busy}>Save section</Button>
    </div>
  )
}
