'use client'

import { useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePlanTransition } from '../hooks/queries'
import type { DtpPlanWithStops } from '../types'

/**
 * Approve / Return / Reject action bar — used inside both the Coordinator
 * console plan-detail panel and the standalone /plans/:id page when viewed
 * by a Coordinator.
 */
export function CoordinatorActions({ plan }: { plan: DtpPlanWithStops }) {
  const t = usePlanTransition(plan.id)
  const [returnNote, setReturnNote] = useState<{ open: boolean; mode: 'RETURN' | 'REJECT'; note: string } | null>(null)

  const isPendingState = ['SUBMITTED', 'MANAGER_ENDORSED', 'UNDER_REVIEW', 'ADJUSTED'].includes(plan.status)
  const canApprove = isPendingState
  const canReturn = isPendingState
  const canReject = ['SUBMITTED', 'MANAGER_ENDORSED', 'UNDER_REVIEW'].includes(plan.status)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        onClick={() => t.approve.mutate(undefined)}
        disabled={!canApprove || t.approve.isPending}
      >
        <Check className="mr-2 h-4 w-4" /> Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setReturnNote({ open: true, mode: 'RETURN', note: '' })}
        disabled={!canReturn}
      >
        <RotateCcw className="mr-2 h-4 w-4" /> Return for edits
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-danger-600 hover:text-danger-700"
        onClick={() => setReturnNote({ open: true, mode: 'REJECT', note: '' })}
        disabled={!canReject}
      >
        <X className="mr-2 h-4 w-4" /> Reject
      </Button>

      {returnNote?.open && (
        <Modal
          open
          onClose={() => setReturnNote(null)}
          title={returnNote.mode === 'RETURN' ? 'Return for edits' : 'Reject plan'}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReturnNote(null)}>Cancel</Button>
              <Button
                onClick={async () => {
                  const note = returnNote.note.trim()
                  if (!note) { toast.error('A note is required'); return }
                  if (returnNote.mode === 'RETURN') await t.returnForEdit.mutateAsync(note)
                  else await t.reject.mutateAsync(note)
                  setReturnNote(null)
                }}
              >
                Send
              </Button>
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
