'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { useRebaseline, useRebaselineDiff } from '../../hooks/useProject'

/** Mirrors the server rule in app/api/projects/[id]/baseline/rebaseline/route.ts. */
export const REBASELINE_REASON_MIN_LENGTH = 20

/**
 * Formal re-baseline (C2): shows the diff against the current baseline before
 * anything is committed, requires a reason of at least 20 characters (enforced
 * here and again by the server), and lets the PM pick the approver.
 */
export function RebaselineDialog({
  open,
  onClose,
  projectId,
  baselineVersion,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  baselineVersion: number
}) {
  const rebaseline = useRebaseline(projectId)
  const [reason, setReason] = useState('')
  const [approverId, setApproverId] = useState('')
  const { data: diff, isLoading: diffLoading } = useRebaselineDiff(projectId, open)
  const { users } = useUsersForSelection({ enabled: open })
  const approvers = users.filter((u) => u.role === 'EXECUTIVE' || u.role === 'ADMIN')
  const reasonLength = reason.trim().length
  const reasonValid = reasonLength >= REBASELINE_REASON_MIN_LENGTH

  const close = () => {
    setReason('')
    setApproverId('')
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      onConfirm={async () => {
        if (!reasonValid) return
        try {
          await rebaseline.mutateAsync({ reason: reason.trim(), approverId: approverId || undefined })
          close()
        } catch {
          // Error toast already shown by the mutation's onError; keep the dialog open.
        }
      }}
      title={`Re-Baseline — Version ${baselineVersion + 1}`}
      message="This freezes the current schedule as a new baseline. The previous baseline is preserved."
      variant="warning"
      confirmLabel="Re-Baseline"
      isLoading={rebaseline.isPending}
      disabled={!reasonValid}
      extraContent={
        <div className="space-y-3">
          <div>
            <div className="text-body-sm font-medium text-ink-primary">Diff preview</div>
            {diffLoading ? (
              <Skeleton className="mt-1 h-16 w-full rounded-card" />
            ) : diff && diff.changes.length > 0 ? (
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-card border border-ink-primary/[0.08] p-2">
                {diff.changes.map((c) => (
                  <li key={c.activityId} className="text-body-sm text-ink-secondary">
                    <span className="font-medium text-ink-primary">{c.title}</span>
                    <span className="text-ink-tertiary"> ({c.phaseName})</span>{': '}
                    {fmtDate(c.oldEnd)} → {fmtDate(c.newEnd)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-body-sm text-ink-tertiary">No schedule changes since the current baseline.</div>
            )}
          </div>
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Reason * (min {REBASELINE_REASON_MIN_LENGTH} characters)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              rows={2}
              className="input mt-1 w-full"
              placeholder="Why is the baseline being revised?"
            />
            <span className={`text-body-sm ${reasonValid ? 'text-ink-tertiary' : 'text-warning-600'}`}>
              {reasonLength}/{REBASELINE_REASON_MIN_LENGTH} minimum
            </span>
          </label>
          <label className="block">
            <span className="text-body-sm text-ink-secondary">Approver (defaults to CEO/Executive)</span>
            <select value={approverId} onChange={(e) => setApproverId(e.target.value)} className="input mt-1 w-full">
              <option value="">Default (CEO/Executive)</option>
              {approvers.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email} · {u.role}</option>
              ))}
            </select>
          </label>
        </div>
      }
    />
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}
