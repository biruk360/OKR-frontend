/**
 * Kind badge for a Todo card (FND-4: TASK | MILESTONE | DUTY | DEPENDENCY |
 * INITIATIVE). Labels come from `TODO_KIND_LABELS` (types/package.ts); tones are
 * MiniBadge (Apple Pro token) tones. Plain tasks render nothing unless
 * `showTask` is set — a task is the default card and needs no badge.
 */
import { MiniBadge, type MiniBadgeTone } from '@/components/ui/dashboard/MiniBadge'
import { TODO_KIND_LABELS, isTodoKind, type TodoKind } from '@/types/package'

export const TODO_KIND_TONE: Record<TodoKind, MiniBadgeTone> = {
  INITIATIVE: 'accent',
  MILESTONE: 'ahead',
  DEPENDENCY: 'warn',
  DUTY: 'neutral',
  TASK: 'neutral',
}

export interface TodoKindBadgeProps {
  /** Todo.kind — unknown values render nothing. */
  kind: string | null | undefined
  /** Also badge plain TASK cards. Default false. */
  showTask?: boolean
  className?: string
}

export default function TodoKindBadge({ kind, showTask = false, className }: TodoKindBadgeProps) {
  if (!isTodoKind(kind)) return null
  if (kind === 'TASK' && !showTask) return null
  return (
    <MiniBadge tone={TODO_KIND_TONE[kind]} className={className} title={`Card kind: ${TODO_KIND_LABELS[kind]}`}>
      {TODO_KIND_LABELS[kind]}
    </MiniBadge>
  )
}
