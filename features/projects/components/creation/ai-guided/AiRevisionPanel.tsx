'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { AlertTriangle, Check, History, Info, Undo2, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NormalizedProjectCreationDraft } from '@/lib/projects/creation-normalize'
import { AI_GUIDED_IDS } from '@/lib/projects/ai-guided-ids'
import type { AiGuidedRevisionPreview } from '@/lib/projects/ai-guided-service'
import type { ProjectCreationDraftNode } from '../../../hooks/useProjects'
import {
  AiGuidedRequestError,
  useApplyAiGuidedRevision,
  usePreviewAiGuidedRevision,
  useUndoAiGuidedRevision,
} from './useAiGuided'

interface AiRevisionPanelProps {
  draft: ProjectCreationDraftNode
  normalized: NormalizedProjectCreationDraft
  aiAvailable: boolean
  onDraftReplaced: (draft: ProjectCreationDraftNode) => void
  onRequestError: (error: AiGuidedRequestError) => void
}

const EXAMPLES = [
  'Move user testing two weeks earlier.',
  'Add a client approval step after each deliverable.',
  'Reduce this to a summary-level schedule.',
  'Split implementation into mobile and web workstreams.',
  'Do not schedule work on weekends.',
]

const MAX_VISIBLE_ENTRIES = 40

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Empty'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value).slice(0, 120)
}

function RevisionEntries({ entries }: { entries: AiGuidedRevisionPreview['entries'] }) {
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {entries.slice(0, MAX_VISIBLE_ENTRIES).map((entry) => (
        <li key={entry.path} className={cn('rounded-lg border p-3', entry.conflict ? 'border-warning-500/40 bg-warning-50' : 'border-border bg-surface-card')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-pill px-2 py-0.5 text-xs font-semibold', entry.kind === 'ADDED' ? 'bg-success-50 text-success-700' : entry.kind === 'REMOVED' ? 'bg-danger-50 text-danger-700' : 'bg-primary/10 text-primary')}>
              {entry.kind.toLowerCase()}
            </span>
            <span className="text-body-sm font-medium text-ink-primary">{entry.label}</span>
            <span className="text-body-sm text-ink-tertiary">{entry.collection}</span>
            {entry.conflict && <span className="rounded-pill bg-warning-100 px-2 py-0.5 text-xs font-semibold text-warning-700">Edited by you</span>}
          </div>
          {entry.kind === 'UPDATED' && entry.fields.length > 0 && (
            <dl className="mt-2 space-y-1">
              {entry.fields.slice(0, 6).map((field) => (
                <div key={field.field} className="grid grid-cols-[8rem_1fr] gap-2 text-body-sm">
                  <dt className="text-ink-tertiary">{field.field}</dt>
                  <dd className="min-w-0 break-words text-ink-secondary"><span className="line-through">{display(field.before)}</span> → <span className="text-ink-primary">{display(field.after)}</span></dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
      {entries.length > MAX_VISIBLE_ENTRIES && (
        <li className="text-body-sm text-ink-tertiary">…and {entries.length - MAX_VISIBLE_ENTRIES} more. The full diff is kept in Source &amp; Changes.</li>
      )}
    </ul>
  )
}

/**
 * Story 3.7 — constrained AI revision: preview (affected count + diff, conflicts
 * with direct edits highlighted) → explicit apply → diff history → undo.
 */
export function AiRevisionPanel({ draft, normalized, aiAvailable, onDraftReplaced, onRequestError }: AiRevisionPanelProps) {
  const previewRevision = usePreviewAiGuidedRevision(draft.id)
  const applyRevision = useApplyAiGuidedRevision(draft.id)
  const undoRevision = useUndoAiGuidedRevision(draft.id)
  const [preview, setPreview] = useState<AiGuidedRevisionPreview | null>(null)
  const [acceptConflicts, setAcceptConflicts] = useState(false)
  const [openDiff, setOpenDiff] = useState<string | null>(null)
  const [undoConflict, setUndoConflict] = useState<{ revisionId: string; labels: string[] } | null>(null)
  const { register, handleSubmit, setValue, watch, reset } = useForm<{ instruction: string; notice: boolean }>({
    defaultValues: { instruction: '', notice: false },
  })
  const notice = watch('notice')
  const busy = previewRevision.isPending || applyRevision.isPending || undoRevision.isPending

  const pending = useMemo(() => ({
    assumptions: normalized.assumptions.filter((item) => item.status === 'PROPOSED').length,
    changes: normalized.changes.filter((item) => item.status === 'PROPOSED').length,
    aiRows: normalized.sources.filter((item) => item.id.startsWith(AI_GUIDED_IDS.rowSource) && item.lastEditor === 'AI').length,
  }), [normalized])

  const revisions = useMemo(() => normalized.sources
    .filter((source) => source.id.startsWith(AI_GUIDED_IDS.revision) && !source.id.startsWith(AI_GUIDED_IDS.revisionUndo))
    .map((source) => {
      const revisionId = source.id.slice(AI_GUIDED_IDS.revision.length)
      return {
        revisionId,
        instruction: (source.excerpt ?? '').replace(/^Instruction: /, ''),
        changes: normalized.changes.filter((change) => change.id.startsWith(`${AI_GUIDED_IDS.revision}${revisionId}-`)),
        undone: normalized.sources.some((candidate) => candidate.id === `${AI_GUIDED_IDS.revisionUndo}${revisionId}`),
      }
    })
    .reverse(), [normalized])

  const requestPreview = handleSubmit(async (values) => {
    setPreview(null)
    setAcceptConflicts(false)
    try {
      const result = await previewRevision.mutateAsync({ version: draft.version, instruction: values.instruction })
      setPreview(result.preview)
      if (result.preview.affectedCount === 0) toast('AI found nothing to change for that instruction.')
    } catch (error) {
      onRequestError(error as AiGuidedRequestError)
    }
  })

  const apply = async () => {
    if (!preview?.previewToken) return
    try {
      const result = await applyRevision.mutateAsync({ version: preview.basedOnVersion, previewToken: preview.previewToken, acceptConflicts })
      toast.success(`Revision applied to ${result.affectedCount} items. Review and accept it before creating the project.`)
      setPreview(null)
      reset({ instruction: '', notice: true })
      onDraftReplaced(result.draft)
    } catch (error) {
      onRequestError(error as AiGuidedRequestError)
    }
  }

  const undo = async (revisionId: string, force: boolean) => {
    try {
      const result = await undoRevision.mutateAsync({ version: draft.version, revisionId, acceptConflicts: force })
      toast.success(`Undid the revision (${result.restored} items restored).`)
      setUndoConflict(null)
      onDraftReplaced(result.draft)
    } catch (error) {
      const failure = error as AiGuidedRequestError
      if (failure.code === 'AI_UNDO_CONFLICT') {
        const conflicts = (failure.details as { conflicts?: Array<{ label: string }> } | undefined)?.conflicts ?? []
        setUndoConflict({ revisionId, labels: conflicts.map((item) => item.label) })
        return
      }
      onRequestError(failure)
    }
  }

  return (
    <section className="space-y-4 rounded-card border border-border bg-surface-card p-5 shadow-card" aria-labelledby="ai-revision-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="ai-revision-title" className="text-section-title text-ink-primary">AI-proposed plan</h3>
          <p className="mt-1 text-body-sm text-ink-secondary">
            {pending.aiRows} AI-marked rows (use the “AI suggestions” filter). {pending.assumptions} assumptions and {pending.changes} proposed changes need your accept/reject decision before the project can be created.
          </p>
        </div>
      </div>

      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void requestPreview() }}>
        <label className="block">
          <span className="mb-1 block text-body-sm font-medium text-ink-primary">Revise with an instruction</span>
          <textarea rows={2} className="input" placeholder="e.g. Move user testing two weeks earlier." {...register('instruction', { required: true, minLength: 3, maxLength: 500 })} />
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setValue('instruction', example)} className="rounded-pill bg-surface-muted px-3 py-1 text-body-sm text-ink-secondary transition-colors duration-[180ms] ease-apple hover:bg-surface-hover">
              {example}
            </button>
          ))}
        </div>
        <p className="flex items-start gap-1.5 text-body-sm text-ink-tertiary">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          Save your review edits first — applying a revision reloads the review from the saved draft. Nothing changes until you apply a preview.
        </p>
        <label className="flex items-center gap-2 text-body-sm text-ink-primary">
          <input type="checkbox" {...register('notice')} /> Send the instruction and a role-only outline of this schedule to OpenAI
        </label>
        <Button type="submit" variant="outline" disabled={busy || !aiAvailable || !notice}>
          <Wand2 data-icon="inline-start" /> {previewRevision.isPending ? 'Preparing preview…' : 'Preview revision'}
        </Button>
      </form>

      {previewRevision.isPending && (
        <div className="space-y-2" aria-label="Preparing revision preview">
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted" />
          <div className="h-16 animate-pulse rounded-lg bg-surface-muted" />
        </div>
      )}

      {preview && preview.affectedCount > 0 && (
        <div className="space-y-3 rounded-card border border-primary/20 bg-primary/5 p-4">
          <p className="text-body font-semibold text-ink-primary">
            {preview.summary} — {preview.affectedCount} item{preview.affectedCount === 1 ? '' : 's'} affected
          </p>
          {preview.conflictCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-warning-500/40 bg-warning-50 p-3 text-body-sm text-ink-primary">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-700" strokeWidth={1.75} />
              <div className="space-y-2">
                <p>{preview.conflictCount} affected item{preview.conflictCount === 1 ? ' was' : 's were'} edited directly by you. The revision will not overwrite them unless you allow it.</p>
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={acceptConflicts} onChange={(event) => setAcceptConflicts(event.target.checked)} /> Allow this revision to overwrite my edits
                </label>
              </div>
            </div>
          )}
          <RevisionEntries entries={preview.entries} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || (preview.conflictCount > 0 && !acceptConflicts)} onClick={apply}>
              <Check data-icon="inline-start" /> {applyRevision.isPending ? 'Applying…' : `Apply to ${preview.affectedCount} items`}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
              <X data-icon="inline-start" /> Discard preview
            </Button>
          </div>
        </div>
      )}

      {revisions.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-body font-semibold text-ink-primary"><History className="size-4" strokeWidth={1.75} /> Applied revisions</h4>
          {revisions.map((revision) => (
            <div key={revision.revisionId} className="rounded-lg border border-border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-medium text-ink-primary">{revision.instruction || 'AI revision'}</p>
                  <p className="text-body-sm text-ink-tertiary">{revision.changes.length} items{revision.undone ? ' · undone' : ''}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setOpenDiff(openDiff === revision.revisionId ? null : revision.revisionId)}>
                    {openDiff === revision.revisionId ? 'Hide diff' : 'View diff'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy || revision.undone} onClick={() => undo(revision.revisionId, false)}>
                    <Undo2 data-icon="inline-start" /> Undo
                  </Button>
                </div>
              </div>
              {undoConflict?.revisionId === revision.revisionId && (
                <div className="mt-2 space-y-2 rounded-lg border border-warning-500/40 bg-warning-50 p-3 text-body-sm">
                  <p className="text-ink-primary">These items changed after the revision: {undoConflict.labels.join(', ')}. Undo would overwrite them.</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => undo(revision.revisionId, true)}>Undo anyway</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setUndoConflict(null)}>Keep my edits</Button>
                  </div>
                </div>
              )}
              {openDiff === revision.revisionId && (
                <div className="mt-2">
                  <RevisionEntries entries={revision.changes.map((change) => {
                    const before = change.originalValue as Record<string, unknown> | null
                    const after = change.proposedValue as Record<string, unknown> | null
                    const [collection] = change.path.split('.')
                    const fields = before && after && typeof before === 'object' && typeof after === 'object'
                      ? Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => ({ field: key, before: before[key], after: after[key] }))
                      : []
                    return {
                      path: change.path,
                      collection: collection as AiGuidedRevisionPreview['entries'][number]['collection'],
                      id: change.path,
                      kind: before === null ? 'ADDED' as const : after === null ? 'REMOVED' as const : 'UPDATED' as const,
                      label: String(after?.title ?? after?.name ?? before?.title ?? before?.name ?? change.path),
                      fields,
                      before,
                      after,
                      conflict: change.reason.includes('overrode a direct user edit'),
                    }
                  })} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
