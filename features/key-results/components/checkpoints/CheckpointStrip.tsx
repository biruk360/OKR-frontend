'use client'

/**
 * CheckpointStrip (KRX-3) — the KR's checkpoints as a row of pills
 * (Q2 · Q3 · Q4), each with its status, due date and target; the next one due
 * is highlighted. For the KR detail page and the KR quick view.
 *
 * Reads GET /api/keyresults/[id]/checkpoints. Viewers with KR edit permission
 * (and an unlocked, active KR) can add checkpoints and open one to edit or
 * review it (mark Met / Missed with the actual). Redacted viewers see nothing.
 */
import { useState } from 'react'
import { CheckCircle2, Clock, Flag, Lock, Plus, XCircle } from 'lucide-react'
import { Button, MiniBadge, SectionHeading } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils'
import { useKrCheckpoints } from '../../hooks/useKrCheckpoints'
import type { KrCheckpointDTO } from './checkpoint-types'
import CheckpointEditor from './CheckpointEditor'
import {
  CHECKPOINT_STATE_LABELS,
  CHECKPOINT_STATE_TONE,
  checkpointState,
  describeDueIn,
  formatCheckpointDate,
  formatCheckpointValue,
  suggestNextCheckpointLabel,
  type CheckpointState,
} from './checkpoint-utils'

export interface CheckpointStripProps {
  keyResultId: string
  /** `full` (default): heading, add button, target text. `compact`: pills only, for rows and quick views. */
  variant?: 'full' | 'compact'
  /** Heading text in the full variant. */
  title?: string
  className?: string
  /** Called after any checkpoint mutation (e.g. to refresh an activity panel). */
  onChanged?: () => void
}

const STATE_ICON: Record<CheckpointState, typeof Flag> = {
  met: CheckCircle2,
  missed: XCircle,
  overdue: Clock,
  next: Flag,
  upcoming: Flag,
}

const STATE_ICON_COLOR: Record<CheckpointState, string> = {
  met: 'var(--ap-ok-fg)',
  missed: 'var(--ap-danger-fg)',
  overdue: 'var(--ap-warn-fg)',
  next: 'var(--ap-accent)',
  upcoming: 'var(--ap-fg-subtle)',
}

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; checkpoint: KrCheckpointDTO; focus: 'details' | 'review' }
  | null

function CheckpointPill({
  checkpoint,
  state,
  unit,
  compact,
  onOpen,
}: {
  checkpoint: KrCheckpointDTO
  state: CheckpointState
  unit: string | null
  compact: boolean
  onOpen?: () => void
}) {
  const Icon = STATE_ICON[state]
  const highlighted = state === 'next' || state === 'overdue'
  const targetValue = formatCheckpointValue(checkpoint.targetValue, unit)
  const actualValue = formatCheckpointValue(checkpoint.actualValue, unit)
  const pending = checkpoint.status === 'PENDING'
  const tooltip = [
    `${checkpoint.label} — ${CHECKPOINT_STATE_LABELS[state]}`,
    `Due ${formatCheckpointDate(checkpoint.dueDate)}${pending ? ` (${describeDueIn(checkpoint.dueDate)})` : ''}`,
    `Target: ${checkpoint.targetText}${targetValue ? ` (${targetValue})` : ''}`,
    actualValue ? `Actual: ${actualValue}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const body = (
    <>
      <span className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" style={{ color: STATE_ICON_COLOR[state] }} aria-hidden />
        <span className="text-body-sm font-semibold" style={{ color: 'var(--ap-fg)' }}>
          {checkpoint.label}
        </span>
        <span className="text-caption tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>
          {formatCheckpointDate(checkpoint.dueDate)}
        </span>
        {(highlighted || !pending) && (
          <MiniBadge tone={CHECKPOINT_STATE_TONE[state]}>{CHECKPOINT_STATE_LABELS[state]}</MiniBadge>
        )}
      </span>
      {!compact && (
        <span className="mt-1 block text-left">
          <span className="line-clamp-2 text-caption" style={{ color: 'var(--ap-fg-muted)' }}>
            {checkpoint.targetText}
          </span>
          {(targetValue || actualValue) && (
            <span className="mt-0.5 block text-caption tabular-nums" style={{ color: 'var(--ap-fg-subtle)' }}>
              {targetValue && <>Target {targetValue}</>}
              {targetValue && actualValue && ' · '}
              {actualValue && <>Actual {actualValue}</>}
            </span>
          )}
          {state === 'next' && (
            <span className="mt-0.5 block text-caption font-medium" style={{ color: 'var(--ap-accent)' }}>
              {describeDueIn(checkpoint.dueDate)}
            </span>
          )}
        </span>
      )}
    </>
  )

  const cls = cn(
    'min-w-0 rounded-[var(--ap-radius-md)] border px-2.5 py-1.5 text-left transition-colors',
    compact ? 'inline-flex items-center' : 'block w-full sm:w-auto sm:min-w-[10rem] sm:max-w-[16rem]',
    onOpen && 'cursor-pointer hover:bg-[var(--ap-bg-hover)] ap-focus-ring',
  )
  const style = {
    borderColor: highlighted ? STATE_ICON_COLOR[state] : 'var(--ap-border)',
    background: 'var(--ap-bg-raised)',
    boxShadow: state === 'next' ? '0 0 0 1px var(--ap-accent)' : undefined,
  }

  return onOpen ? (
    <button type="button" className={cls} style={style} title={tooltip} onClick={onOpen} aria-label={tooltip.replace(/\n/g, '. ')}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style} title={tooltip}>
      {body}
    </div>
  )
}

export default function CheckpointStrip({
  keyResultId,
  variant = 'full',
  title = 'Checkpoints',
  className,
  onChanged,
}: CheckpointStripProps) {
  const { data, isLoading, isError, error } = useKrCheckpoints(keyResultId)
  const [editor, setEditor] = useState<EditorState>(null)
  const compact = variant === 'compact'

  if (isLoading) {
    return (
      <div className={cn('flex gap-2', className)} aria-busy="true">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-28" />
      </div>
    )
  }
  if (isError) {
    // 403: the viewer cannot see this KR — render nothing rather than an error box.
    if (error?.status === 403) return null
    return compact ? null : (
      <p className={cn('text-caption', className)} style={{ color: 'var(--ap-danger-fg)' }}>
        Could not load checkpoints.
      </p>
    )
  }
  if (!data || data.isRedacted) return null

  const { checkpoints, nextCheckpointId, permissions, definition, isLocked } = data
  if (compact && checkpoints.length === 0) return null

  const unit = definition?.unit ?? null
  const now = new Date()

  const pills = (
    <ol className={cn('flex flex-wrap items-stretch gap-x-1.5 gap-y-2', compact && 'items-center')} aria-label="Key result checkpoints">
      {checkpoints.map((cp, i) => {
        const state = checkpointState(cp, nextCheckpointId, now)
        return (
          <li key={cp.id} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="text-caption" style={{ color: 'var(--ap-fg-faint)' }}>
                ·
              </span>
            )}
            <CheckpointPill
              checkpoint={cp}
              state={state}
              unit={unit}
              compact={compact}
              onOpen={
                permissions.canEdit
                  ? () =>
                      setEditor({
                        mode: 'edit',
                        checkpoint: cp,
                        focus: cp.status === 'PENDING' && state !== 'upcoming' ? 'review' : 'details',
                      })
                  : undefined
              }
            />
          </li>
        )
      })}
    </ol>
  )

  return (
    <div className={cn(!compact && 'space-y-2', className)}>
      {!compact && (
        <SectionHeading
          title={title}
          as="h3"
          bordered={false}
          right={
            <span className="flex items-center gap-2">
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-caption" style={{ color: 'var(--ap-fg-subtle)' }}>
                  <Lock className="size-3" aria-hidden /> Locked
                </span>
              )}
              {permissions.canCreate && (
                <Button type="button" variant="ghost" size="xs" onClick={() => setEditor({ mode: 'create' })}>
                  <Plus aria-hidden />
                  Add
                </Button>
              )}
            </span>
          }
        />
      )}

      {checkpoints.length > 0 ? (
        pills
      ) : (
        <p className="text-body-sm" style={{ color: 'var(--ap-fg-subtle)' }}>
          {permissions.canCreate
            ? 'No checkpoints yet. Add the dates this key result is measured (e.g. Q2 · Q3 · Q4).'
            : 'No checkpoints set.'}
        </p>
      )}

      {editor && (
        <CheckpointEditor
          open
          onClose={() => setEditor(null)}
          keyResultId={keyResultId}
          checkpoint={editor.mode === 'edit' ? editor.checkpoint : null}
          focus={editor.mode === 'edit' ? editor.focus : 'details'}
          direction={definition?.direction}
          unit={unit}
          defaultLabel={editor.mode === 'create' ? suggestNextCheckpointLabel(checkpoints) : undefined}
          canDelete={permissions.canDelete}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}
