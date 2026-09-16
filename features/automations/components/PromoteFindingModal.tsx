'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/Modal'
import { useUsersForSelection } from '@/hooks/useUsersForSelection'
import { cn } from '@/lib/utils'
import type { FindingBlock } from '@/types/automations'
import { usePromoteFinding } from '../hooks/useAutomations'

/**
 * Turn one Finding into a Todo or a Risk (FR-12).
 *
 * Always a human action. This is the escape valve that stops the generic
 * document model from being a dead end, without reintroducing the "the AI
 * created 300 tasks overnight" failure the DRY_RUN gate exists to prevent.
 */
type Target = 'TODO' | 'RISK'
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

export function PromoteFindingModal({
  briefingId,
  finding,
  onClose,
}: {
  briefingId: string
  finding: FindingBlock | null
  onClose: () => void
}) {
  const promote = usePromoteFinding(briefingId)
  const { users } = useUsersForSelection()

  const [target, setTarget] = useState<Target>('TODO')
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('MEDIUM')
  const [error, setError] = useState<string | null>(null)

  // Reset per finding rather than in an effect — the modal unmounts between uses.
  const effectiveTitle = title || finding?.title || ''

  const submit = async () => {
    if (!finding) return
    setError(null)
    try {
      await promote.mutateAsync({
        dedupeKey: finding.dedupeKey,
        target,
        title: effectiveTitle,
        ...(target === 'TODO' && assigneeId ? { assigneeId } : {}),
        ...(target === 'TODO' && dueDate ? { dueDate } : {}),
        ...(target === 'RISK' ? { severity } : {}),
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Modal
      open={Boolean(finding)}
      onClose={onClose}
      title="Create from this finding"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={promote.isPending || !effectiveTitle}>
            {promote.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create {target === 'TODO' ? 'to-do' : 'risk'}
          </Button>
        </div>
      }
    >
      {finding && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['TODO', 'RISK'] as Target[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTarget(option)}
                className={cn(
                  'rounded-card border px-4 py-2 text-body-sm transition-colors',
                  target === option
                    ? 'border-primary-500 bg-primary-500/10 text-primary-600'
                    : 'border-surface-muted text-ink-secondary hover:bg-surface-hover'
                )}
              >
                {option === 'TODO' ? 'To-do' : 'Risk'}
              </button>
            ))}
          </div>

          <div>
            <Label htmlFor="promote-title">Title</Label>
            <Input
              id="promote-title"
              value={effectiveTitle}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          {target === 'TODO' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="promote-assignee">Assign to</Label>
                <select
                  id="promote-assignee"
                  className="mt-1 h-10 w-full rounded-md border border-surface-muted bg-surface-card px-3 text-body-sm"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                >
                  <option value="">Me</option>
                  {(users ?? []).map((user) => (
                    <option key={user.id} value={user.id}>{user.name ?? user.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="promote-due">Due date</Label>
                <Input id="promote-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="promote-severity">Severity</Label>
              <select
                id="promote-severity"
                className="mt-1 h-10 w-full rounded-md border border-surface-muted bg-surface-card px-3 text-body-sm"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as (typeof SEVERITIES)[number])}
              >
                {SEVERITIES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
              </select>
            </div>
          )}

          {finding.fields && Object.keys(finding.fields).length > 0 && (
            <div className="rounded-card border border-surface-muted bg-surface-sidebar p-3">
              <p className="text-body-sm text-ink-secondary">
                The record will carry these details and a link back to this briefing:
              </p>
              <dl className="mt-2 space-y-0.5">
                {Object.entries(finding.fields).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-body-sm">
                    <dt className="text-ink-secondary">{key}:</dt>
                    <dd className="text-ink-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {error && (
            <p className="rounded-card border border-danger-500/30 bg-danger-500/5 p-3 text-body-sm text-danger-500">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
