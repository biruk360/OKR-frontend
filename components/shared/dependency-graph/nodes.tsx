'use client'

/**
 * React Flow node renderers for the dependency graph (CON-4). Card styling
 * follows components/hierarchy (rounded-xl, bg-card, border-border, shadow,
 * ink-tertiary handles); tones come from --ap-* tokens only.
 *
 * Nodes are rendered as buttons (`data.onOpen`) so they open by click and by
 * keyboard; the canvas turns off dragging and selection so a click is a click.
 */
import { memo } from 'react'
import { format } from 'date-fns'
import { Handle, Position, type NodeProps } from 'reactflow'
import { EyeOff } from 'lucide-react'
import { MiniBadge, type MiniBadgeTone } from '@/components/ui/dashboard/MiniBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import { DEPENDENCY_STATUS_LABELS, DEPENDENCY_TYPE_LABELS, type DependencyStatus } from '@/types/package'
import {
  GRAPH_SIZES,
  type DependencyEdgeTone,
  type DependencyNodeData,
  type PersonNodeData,
} from './graph-model'

/** Stroke / accent colour per tone (tokens only). */
export const DEPENDENCY_TONE_COLOR: Record<DependencyEdgeTone, string> = {
  danger: 'var(--ap-danger)',
  warn: 'var(--ap-warn)',
  open: 'var(--ap-fg-muted)',
  muted: 'var(--ap-fg-faint)',
}

const TONE_TEXT: Record<DependencyEdgeTone, string> = {
  danger: 'var(--ap-danger-fg)',
  warn: 'var(--ap-warn-fg)',
  open: 'var(--ap-fg-subtle)',
  muted: 'var(--ap-fg-subtle)',
}

const STATUS_TONE: Record<DependencyStatus, MiniBadgeTone> = {
  OPEN: 'neutral',
  IN_PROGRESS: 'accent',
  DONE: 'ok',
  BLOCKED: 'danger',
  DROPPED: 'neutral',
}

const HANDLE_CLASS = '!h-2 !w-2 !border-0 !bg-ink-tertiary'

/** Runtime-only fields the canvas adds to the pure node data. */
export interface NodeRuntime {
  onOpen?: () => void
  focused?: boolean
}

function formatDay(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : format(date, 'd MMM')
}

export const DependencyItemNode = memo(function DependencyItemNode({ data }: NodeProps<DependencyNodeData & NodeRuntime>) {
  const { dependency: dep, tone, partiesHidden, onOpen, focused } = data
  const neededBy = formatDay(dep.neededByDate)
  const timing = dep.open && dep.late ? 'Late' : dep.open && dep.dueSoon ? 'Due soon' : null
  const label = [dep.ref, dep.title, DEPENDENCY_STATUS_LABELS[dep.status], timing].filter(Boolean).join(' · ')

  return (
    <div style={{ width: GRAPH_SIZES.dependencyWidth }}>
      <Handle type="target" position={Position.Left} className={HANDLE_CLASS} isConnectable={false} />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open dependency ${label}`}
        className={cn(
          'nodrag flex w-full flex-col gap-1 rounded-xl border border-l-4 bg-card px-3 py-2 text-left shadow-sm transition-shadow ap-focus-ring hover:shadow-md',
          focused ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-border',
          !dep.open && 'opacity-75',
        )}
        style={{ borderLeftColor: DEPENDENCY_TONE_COLOR[tone], minHeight: GRAPH_SIZES.dependencyHeight - 8 }}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {dep.ref && <MiniBadge mono>{dep.ref}</MiniBadge>}
          <MiniBadge tone={STATUS_TONE[dep.status]} className={cn(dep.status === 'DROPPED' && 'line-through')}>
            {DEPENDENCY_STATUS_LABELS[dep.status]}
          </MiniBadge>
          {dep.depType && (
            <span className="truncate text-micro text-[var(--ap-fg-subtle)]">{DEPENDENCY_TYPE_LABELS[dep.depType]}</span>
          )}
        </span>
        <span className="line-clamp-2 text-caption font-medium leading-snug text-[var(--ap-fg)]">{dep.title}</span>
        <span className="flex items-center gap-1.5 text-micro" style={{ color: TONE_TEXT[tone] }}>
          {timing && <span className="font-semibold">{timing}</span>}
          <span>{neededBy ? `Needed by ${neededBy}` : 'No needed-by date'}</span>
          {partiesHidden && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-[var(--ap-fg-subtle)]" title="Parties are not shown to you">
              <EyeOff className="size-3" aria-hidden />
              Parties hidden
            </span>
          )}
        </span>
      </button>
      <Handle type="source" position={Position.Right} className={HANDLE_CLASS} isConnectable={false} />
    </div>
  )
})

const ROLE_CAPTION: Record<PersonNodeData['role'], (count: number) => string> = {
  center: (n) => `${n} dependenc${n === 1 ? 'y' : 'ies'}`,
  provider: (n) => `Delivers ${n}`,
  needer: (n) => `Waiting on ${n}`,
}

export const DependencyPersonNode = memo(function DependencyPersonNode({ data }: NodeProps<PersonNodeData & NodeRuntime>) {
  const { person, role, count, tone, onOpen } = data
  const isCenter = role === 'center'
  const name = person.name ?? 'Unknown person'
  const caption = ROLE_CAPTION[role](count)

  return (
    <div style={{ width: isCenter ? GRAPH_SIZES.centerWidth : GRAPH_SIZES.personWidth }}>
      {role !== 'provider' && (
        <Handle type="target" position={Position.Left} className={HANDLE_CLASS} isConnectable={false} />
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${name}’s links and dependencies (${caption})`}
        className={cn(
          'nodrag flex w-full items-center gap-2 rounded-lg border bg-card text-left shadow-sm transition-shadow ap-focus-ring hover:shadow-md',
          isCenter ? 'border-primary-500 p-3 ring-2 ring-primary-500/20' : 'border-border p-2',
        )}
      >
        <UserAvatar user={{ id: person.id, name, avatar: person.avatar }} size={isCenter ? 36 : 26} tooltip={false} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium text-[var(--ap-fg)]', isCenter ? 'text-body-sm' : 'text-caption')}>
            {name}
          </span>
          <span className="flex items-center gap-1 text-micro text-[var(--ap-fg-subtle)]">
            <span
              className="inline-block size-1.5 shrink-0 rounded-full"
              style={{ background: DEPENDENCY_TONE_COLOR[tone] }}
              aria-hidden
            />
            {caption}
          </span>
        </span>
      </button>
      {role !== 'needer' && (
        <Handle type="source" position={Position.Right} className={HANDLE_CLASS} isConnectable={false} />
      )}
    </div>
  )
})
