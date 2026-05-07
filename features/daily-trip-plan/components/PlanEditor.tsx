'use client'

import { useState } from 'react'
import { CalendarDays, Send, Trash2, Copy, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatEthiopian } from '@/lib/dtp/ec-calendar'
import { StatusBadge } from './StatusBadge'
import { StopList } from './StopList'
import { PlanTimeline } from './PlanTimeline'
import { dtpApi } from '../services/api'
import type { DtpPlanWithStops } from '../types'
import { usePlan, usePlanTransition, useInvalidatePlan } from '../hooks/queries'
import { isRequesterEditable } from '@/lib/dtp/state-machine'
import type { DtpStatus } from '@/types/dtp'

interface Props {
  planId: string
  /** Hint from the parent: is the current viewer the requester? When undefined,
   * we treat the editor as read-only-or-coordinator and trust the API to gate. */
  isRequester?: boolean
}

export function PlanEditor({ planId, isRequester }: Props) {
  const planQ = usePlan(planId)
  const inv = useInvalidatePlan()
  const transitions = usePlanTransition(planId)
  const [returnNote, setReturnNote] = useState<{ open: boolean; note: string } | null>(null)
  const [cloneState, setCloneState] = useState<{ open: boolean; date: string } | null>(null)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)

  if (planQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (planQ.isError || !planQ.data) return <div className="p-6 text-sm text-red-700">Failed to load plan.</div>

  const plan: DtpPlanWithStops = planQ.data.plan
  const events = planQ.data.events
  const status = plan.status as DtpStatus
  const tripDate = new Date(plan.tripDate)
  const editable = isRequester !== false && isRequesterEditable(status)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT — date / priority / mode header */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Plan for {tripDate.toISOString().slice(0, 10)}
              </CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">{formatEthiopian(tripDate)}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={plan.status} />
              {plan.late && <span className="rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs">Late</span>}
              {plan.emergency && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs">Emergency</span>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <SelectButtons
                value={plan.priority}
                onChange={async (v) => {
                  await dtpApi.patchPlan(planId, { priority: v as 'NORMAL' | 'URGENT' })
                  inv(planId)
                }}
                disabled={!editable}
                options={[{ value: 'NORMAL', label: 'Normal' }, { value: 'URGENT', label: 'Urgent' }]}
              />
              <Label className="text-xs text-muted-foreground ml-3">Default mode</Label>
              <SelectButtons
                value={plan.defaultModeOfMovement}
                onChange={async (v) => {
                  await dtpApi.patchPlan(planId, { defaultModeOfMovement: v })
                  inv(planId)
                }}
                disabled={!editable}
                options={[
                  { value: 'COMPANY_VEHICLE', label: 'Company vehicle' },
                  { value: 'PUBLIC_TRANSPORT', label: 'Public transport' },
                  { value: 'PERSONAL_VEHICLE', label: 'Personal' },
                  { value: 'RIDE_HAIL', label: 'Ride-hail' },
                  { value: 'WALKING', label: 'Walking' },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        {plan.status === 'ADJUSTED' && (
          <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-sm">
            <p className="font-medium text-purple-900 mb-1">Coordinator made changes to your plan.</p>
            <p className="text-purple-900">Review the side-by-side diff on each stop card below, then acknowledge to finalize approval.</p>
            <div className="mt-2">
              <Button
                size="sm"
                onClick={() => transitions.acknowledge.mutate()}
                disabled={transitions.acknowledge.isPending}
              >
                Acknowledge changes
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stops</CardTitle>
          </CardHeader>
          <CardContent>
            <StopList
              planId={planId}
              stops={plan.stops}
              readOnly={!editable && plan.status !== 'SUBMITTED' && plan.status !== 'MANAGER_ENDORSED' && plan.status !== 'UNDER_REVIEW'}
              showDiff={plan.adjusted || plan.status === 'ADJUSTED' || plan.status === 'APPROVED'}
            />
          </CardContent>
        </Card>

        {/* Sticky footer: total + submit */}
        <div className="sticky bottom-0 -mx-2 px-2 py-3 bg-background/90 backdrop-blur border-t border-border flex flex-wrap items-center gap-3 justify-between">
          <Totals plan={plan} />
          <div className="flex flex-wrap gap-2">
            {(status === 'DRAFT' || status === 'RETURNED') && isRequester && (
              <Button
                onClick={async () => {
                  if (plan.stops.length === 0) { toast.error('Add at least one stop'); return }
                  await transitions.submit.mutateAsync()
                }}
                disabled={transitions.submit.isPending}
              >
                <Send className="mr-2 h-4 w-4" /> Submit for approval
              </Button>
            )}
            {(status === 'SUBMITTED' || status === 'MANAGER_ENDORSED' || status === 'UNDER_REVIEW' || status === 'DRAFT' || status === 'RETURNED') && isRequester && (
              <Button variant="outline" onClick={() => setConfirmWithdraw(true)}>
                <X className="mr-2 h-4 w-4" /> Withdraw
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                const next = new Date(tripDate); next.setUTCDate(next.getUTCDate() + 1)
                setCloneState({ open: true, date: next.toISOString().slice(0, 10) })
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Clone to date
            </Button>
            {(status === 'DRAFT' || status === 'WITHDRAWN') && isRequester && (
              <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={async () => {
                await dtpApi.deletePlan(planId)
                inv(planId)
                toast.success('Plan deleted')
              }}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — timeline + audit */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent>
            <PlanTimeline plan={plan} events={events} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Audit log</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs max-h-72 overflow-auto">
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2 border-b border-border last:border-0 py-1">
                  <span><span className="font-medium">{e.action}</span>{e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && <span className="text-muted-foreground"> {e.fromStatus} → {e.toStatus}</span>}</span>
                  <span className="text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                </li>
              ))}
              {events.length === 0 && <li className="text-muted-foreground">No events yet.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Withdraw confirmation */}
      <ConfirmDialog
        open={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        title="Withdraw this plan?"
        message="The Coordinator will be notified that you're pulling it back. You can re-submit anytime."
        confirmLabel="Withdraw"
        variant="warning"
        onConfirm={async () => { await transitions.withdraw.mutateAsync(); setConfirmWithdraw(false) }}
      />

      {/* Clone modal */}
      {cloneState?.open && (
        <Modal
          open={cloneState.open}
          onClose={() => setCloneState(null)}
          title="Clone plan to a new date"
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCloneState(null)}>Cancel</Button>
              <Button
                onClick={async () => {
                  if (!cloneState) return
                  await transitions.clone.mutateAsync(cloneState.date)
                  setCloneState(null)
                }}
              >
                Clone
              </Button>
            </div>
          }
        >
          <Label>Trip date</Label>
          <Input type="date" value={cloneState.date} onChange={(e) => setCloneState({ ...cloneState, date: e.target.value })} />
        </Modal>
      )}

      {/* Coordinator-side return note (rendered only when this component is reused
       * for the Coordinator path — kept here for one-stop wiring). */}
      {returnNote?.open && (
        <Modal open onClose={() => setReturnNote(null)} title="Return for edits" size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReturnNote(null)}>Cancel</Button>
              <Button onClick={async () => {
                if (!returnNote.note.trim()) { toast.error('Please describe what to fix'); return }
                await transitions.returnForEdit.mutateAsync(returnNote.note)
                setReturnNote(null)
              }}>Send</Button>
            </div>
          }
        >
          <Label>Note for the requester</Label>
          <Textarea rows={4} value={returnNote.note} onChange={(e) => setReturnNote({ ...returnNote, note: e.target.value })} />
        </Modal>
      )}
    </div>
  )
}

function Totals({ plan }: { plan: DtpPlanWithStops }) {
  const totalDwell = plan.stops.reduce((acc, s) => acc + s.dwellMinutes, 0)
  return (
    <div className="text-xs text-muted-foreground">
      <span className="mr-3">{plan.stops.length} stop{plan.stops.length === 1 ? '' : 's'}</span>
      <span>Total dwell: {Math.floor(totalDwell / 60)}h {totalDwell % 60}m</span>
    </div>
  )
}

function SelectButtons({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <div className="inline-flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            className={
              'inline-flex items-center justify-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ' +
              (selected
                ? 'border-blue-600 bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50')
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
