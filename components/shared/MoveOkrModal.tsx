'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { MoveRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import EntityPicker, { type EntityPickerValue } from '@/components/ui/EntityPicker'

/**
 * "Move" for an objective (re-parent) or a key result (re-file under another
 * objective). Both menus rendered a disabled "Move (coming soon)" item; the
 * objective API already supported `parentObjectiveId` with cycle checking, and
 * the key-result API was extended to accept `objectiveId` at the same time as
 * this shipped.
 *
 * One modal for both because the interaction is identical — pick a target
 * objective, confirm — and the two differ only in the field name and in what
 * cannot be picked.
 */

export type MoveKind = 'OBJECTIVE' | 'KEY_RESULT'

export interface MoveOkrModalProps {
  open: boolean
  onClose: () => void
  kind: MoveKind
  /** The entity being moved. */
  entity: {
    id: string
    title: string
    /** Current parent objective id — pre-selects the picker and is excluded as a no-op. */
    currentParentId?: string | null
    /** KEY_RESULT only: the PATCH route requires these alongside the move. */
    ownerId?: string
    startValue?: number | null
    targetValue?: number | null
    unit?: string | null
    description?: string | null
  }
  /** Ids the picker must refuse — for an objective, itself and its descendants. */
  disabledIds?: string[]
  onMoved?: () => void
}

export default function MoveOkrModal({
  open,
  onClose,
  kind,
  entity,
  disabledIds = [],
  onMoved,
}: MoveOkrModalProps) {
  const [target, setTarget] = useState<EntityPickerValue | null>(null)
  const [saving, setSaving] = useState(false)

  const isObjective = kind === 'OBJECTIVE'
  const noop = !!target && target.id === entity.currentParentId

  const submit = async () => {
    if (!target || noop) return
    setSaving(true)
    try {
      const url = isObjective
        ? `/api/objectives/${entity.id}`
        : `/api/keyresults/${entity.id}`

      // The key-result PATCH validates title/ownerId/targetValue as required on
      // every call, so a move has to resend them unchanged. That is the route's
      // shape, not something this modal chose.
      const body = isObjective
        ? { parentObjectiveId: target.id }
        : {
            objectiveId: target.id,
            title: entity.title,
            ownerId: entity.ownerId,
            description: entity.description ?? '',
            startValue: entity.startValue,
            targetValue: entity.targetValue,
            unit: entity.unit,
          }

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        // Surface the server's reason verbatim — it is specific and actionable
        // ("would create a circular dependency", "must be in the same timeframe").
        throw new Error(data?.error || 'Move failed')
      }
      toast.success(isObjective ? 'Objective moved' : 'Key result moved')
      onMoved?.()
      onClose()
      setTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Move failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) { setTarget(null); onClose() } }}
      title={isObjective ? 'Move objective' : 'Move key result'}
      icon={MoveRight}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-[13px] text-muted-foreground">
          {isObjective ? (
            <>Align <span className="font-medium text-foreground">{entity.title}</span> under a different parent objective.</>
          ) : (
            <>File <span className="font-medium text-foreground">{entity.title}</span> under a different objective.</>
          )}
        </p>

        <div>
          <label className="mb-1.5 block text-[12px] font-semibold">
            {isObjective ? 'New parent objective' : 'New objective'}
          </label>
          <EntityPicker
            value={target}
            onChange={setTarget}
            selectable="objective"
            query={{ status: 'ACTIVE', limit: 200 }}
            // Self and descendants for an objective (the server also refuses a
            // cycle, but blocking it in the picker is the kinder failure);
            // the current parent for a key result, since that is a no-op.
            disabledIds={[
              entity.id,
              ...disabledIds,
              ...(entity.currentParentId ? [entity.currentParentId] : []),
            ]}
            recentKey={isObjective ? 'move-objective' : 'move-key-result'}
            placeholder="Choose an objective…"
            width={360}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            The target must be active and in the same timeframe. Progress is
            recalculated for both the old and the new parent.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => { setTarget(null); onClose() }} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!target || noop || saving}>
            {saving ? 'Moving…' : 'Move'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
