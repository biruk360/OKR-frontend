'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/button'
import type { NormalizedProjectCreationDraft } from '@/lib/projects/creation-normalize'
import {
  projectCreationAcknowledgedWarningCount,
  projectCreationCommitCounts,
} from '@/lib/projects/creation-commit-shared'

interface CommitConfirmDialogProps {
  open: boolean
  draft: NormalizedProjectCreationDraft
  projectManagerLabel: string
  isPending: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

export function CommitConfirmDialog({
  open,
  draft,
  projectManagerLabel,
  isPending,
  error,
  onClose,
  onConfirm,
}: CommitConfirmDialogProps) {
  const counts = projectCreationCommitCounts(draft)
  const warnings = projectCreationAcknowledgedWarningCount(draft)
  const project = draft.project
  const creationStatement = `Create project with ${counts.phases} phases, ${counts.milestones} milestones, ${counts.activities} activities, ${counts.deliverables} deliverables, and ${counts.dependencies} dependency links.`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm project creation"
      icon={CheckCircle2}
      iconClassName="text-success-600"
      size="md"
      closeOnBackdrop={!isPending}
      closeOnEsc={!isPending}
      footer={
        <>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>Back to review</Button>
          <Button type="button" disabled={isPending} onClick={() => void onConfirm()}>
            {isPending ? 'Creating project…' : 'Create Project'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-body font-semibold text-ink-primary">{creationStatement}</p>
        <dl className="grid gap-3 rounded-card bg-surface-muted p-4 sm:grid-cols-2">
          <CommitDetail label="Project" value={project.name ?? 'Missing'} />
          <CommitDetail label="Code" value={project.code ?? 'Generated automatically'} />
          <CommitDetail label="Client" value={project.clientName ?? 'Missing'} />
          <CommitDetail label="Project manager" value={projectManagerLabel} />
          <CommitDetail label="Start" value={project.plannedStart ?? 'Missing'} />
          <CommitDetail label="End" value={project.plannedEnd ?? 'Missing'} />
          <CommitDetail label="Acknowledged unresolved warnings" value={String(warnings)} />
        </dl>
        <div className="flex items-start gap-2 rounded-card border border-warning-500/30 bg-warning-50 p-3 text-body-sm text-warning-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>The project will remain in Planning and unbaselined. No assignee, client, portal, or external notification will be sent.</span>
        </div>
        {isPending && (
          <div className="animate-pulse rounded-card bg-primary-50 p-3 text-body-sm text-primary-700" role="status">
            Creating the project and complete schedule in one transaction…
          </div>
        )}
        {error && <p role="alert" className="rounded-card border border-danger-500/30 bg-danger-50 p-3 text-body-sm text-danger-700">{error}</p>}
      </div>
    </Modal>
  )
}

function CommitDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-overline text-ink-tertiary">{label}</dt><dd className="mt-0.5 text-body-sm font-medium text-ink-primary">{value}</dd></div>
}
