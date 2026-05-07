'use client'

import { useState } from 'react'
import { Pencil, Trash2, Clock, Repeat, ArrowRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { DtpStop } from '../types'
import { StopEditorModal } from './StopEditorModal'
import { useAddStop, useUpdateStop, useDeleteStop } from '../hooks/queries'

interface Props {
  planId: string
  stops: DtpStop[]
  readOnly?: boolean
  /** When true, show the side-by-side coordinator-adjustment diff banner. */
  showDiff?: boolean
}

export function StopList({ planId, stops, readOnly, showDiff }: Props) {
  const addStop = useAddStop(planId)
  const updateStop = useUpdateStop(planId)
  const deleteStop = useDeleteStop(planId)
  const [editing, setEditing] = useState<DtpStop | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<DtpStop | null>(null)

  return (
    <div className="space-y-2">
      {stops.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No stops yet. Add your first one below.
        </div>
      )}
      {stops.map((s) => (
        <StopCard
          key={s.id}
          stop={s}
          readOnly={readOnly}
          onEdit={() => setEditing(s)}
          onRemove={() => setConfirmDelete(s)}
          showDiff={showDiff}
        />
      ))}
      {!readOnly && (
        <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
          + Add stop
        </Button>
      )}

      {adding && (
        <StopEditorModal
          open={adding}
          onClose={() => setAdding(false)}
          onSubmit={async (form) => {
            await addStop.mutateAsync({
              destinationName: form.destinationName,
              destinationAddress: form.destinationAddress,
              contactPerson: form.contactPerson || undefined,
              contactPhone: form.contactPhone || undefined,
              plannedStart: form.plannedStart,
              dwellMinutes: form.dwellMinutes,
              flexibility: form.flexibility,
              tripMode: form.tripMode,
              pickupBackTo: form.pickupBackTo,
              pickupBackAddress: form.pickupBackAddress || undefined,
              requiresVehicle: form.requiresVehicle,
              requiresCashAdvance: form.requiresCashAdvance,
              cashAdvanceAmount: form.cashAdvanceAmount === '' ? undefined : form.cashAdvanceAmount,
              reason: form.reason,
              expectedOutcome: form.expectedOutcome || undefined,
              tripTypeId: form.tripTypeId || undefined,
            })
            setAdding(false)
          }}
          busy={addStop.isPending}
        />
      )}

      {editing && (
        <StopEditorModal
          open={!!editing}
          onClose={() => setEditing(null)}
          initial={editing}
          onSubmit={async (form) => {
            await updateStop.mutateAsync({
              stopId: editing.id,
              body: {
                destinationName: form.destinationName,
                destinationAddress: form.destinationAddress,
                contactPerson: form.contactPerson || undefined,
                contactPhone: form.contactPhone || undefined,
                plannedStart: form.plannedStart,
                dwellMinutes: form.dwellMinutes,
                flexibility: form.flexibility,
                tripMode: form.tripMode,
                pickupBackTo: form.pickupBackTo,
                pickupBackAddress: form.pickupBackAddress || undefined,
                requiresVehicle: form.requiresVehicle,
                requiresCashAdvance: form.requiresCashAdvance,
                cashAdvanceAmount: form.cashAdvanceAmount === '' ? null : form.cashAdvanceAmount,
                reason: form.reason,
                expectedOutcome: form.expectedOutcome || undefined,
                tripTypeId: form.tripTypeId || undefined,
              },
            })
            setEditing(null)
          }}
          busy={updateStop.isPending}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove this stop?"
        message={confirmDelete ? `${confirmDelete.destinationName} at ${confirmDelete.plannedStart}` : ''}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={async () => {
          if (confirmDelete) await deleteStop.mutateAsync(confirmDelete.id)
          setConfirmDelete(null)
        }}
      />
    </div>
  )
}

function StopCard({
  stop,
  readOnly,
  onEdit,
  onRemove,
  showDiff,
}: {
  stop: DtpStop
  readOnly?: boolean
  onEdit: () => void
  onRemove: () => void
  showDiff?: boolean
}) {
  const trafficFlag = (() => {
    if (!stop.trafficEstimate) return false
    try { return !!(JSON.parse(stop.trafficEstimate) as { flagged?: boolean }).flagged } catch { return false }
  })()

  const adjusted = !!stop.coordinatorAdjustments
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground tabular-nums">{stop.plannedStart}</span>
            <span className="truncate">{stop.destinationName}</span>
            {stop.tripMode === 'ROUND_TRIP' ? <Repeat className="h-3.5 w-3.5 text-muted-foreground" aria-label="Round trip" /> : <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="One way" />}
            {trafficFlag && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-warning-50 text-warning-700 border border-warning-200 px-2 py-0.5 text-[11px] font-medium">
                <AlertTriangle className="h-3 w-3" /> Heavy traffic likely
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{stop.destinationAddress}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Dwell {fmtDur(stop.dwellMinutes)}</span>
            <span>{flexLabel(stop.flexibility)}</span>
            {stop.requiresVehicle ? <span>Vehicle</span> : <span>No vehicle</span>}
            {stop.requiresCashAdvance && stop.cashAdvanceAmount && <span>Cash: {stop.cashAdvanceAmount} ETB</span>}
          </div>
          {stop.reason && <div className="mt-1 text-sm">{stop.reason}</div>}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit stop">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove stop">
              <Trash2 className="h-4 w-4 text-danger-600" />
            </Button>
          </div>
        )}
      </div>
      {showDiff && adjusted && stop.coordinatorAdjustments && (
        <DiffStrip diffJson={stop.coordinatorAdjustments} />
      )}
    </div>
  )
}

function DiffStrip({ diffJson }: { diffJson: string }) {
  let diff: Record<string, { before: unknown; after: unknown }> = {}
  try { diff = JSON.parse(diffJson) } catch { /* ignore parse */ }
  const entries = Object.entries(diff)
  if (entries.length === 0) return null
  return (
    <div className="mt-2 rounded-md border border-purple-200 bg-purple-50 p-2 text-xs">
      <div className="font-medium text-purple-800 mb-1">Coordinator adjustments</div>
      <ul className="space-y-0.5">
        {entries.map(([k, v]) => (
          <li key={k} className="font-mono">
            <span className="text-muted-foreground">{k}:</span>{' '}
            <span className="line-through text-danger-700">{fmtVal(v.before)}</span>{' → '}
            <span className="text-success-700">{fmtVal(v.after)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function fmtDur(m: number): string { return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim() : `${m}m` }
function flexLabel(f: string): string {
  return ({ FIXED: 'Fixed', FLEX_30: '±30 min', FLEX_2H: '±2 h', ANY_TIME: 'Any time' } as Record<string, string>)[f] ?? f
}
