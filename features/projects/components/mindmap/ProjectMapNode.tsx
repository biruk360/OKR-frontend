'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { CheckCircle2, ChevronDown, ChevronRight, CircleDot, Flag, FolderKanban, ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACTIVITY_STATUS_LABEL, type ActivityStatus } from '../../types'

export type ProjectMapNodeKind = 'project' | 'phase' | 'milestone' | 'activity'

export interface ProjectMapNodeData {
  kind: ProjectMapNodeKind
  title: string
  eyebrow: string
  status?: ActivityStatus | string
  progress: number
  detail: string
  ownerParty?: string
  childCount: number
  hasChildren: boolean
  isExpanded: boolean
  onToggle: (id: string) => void
}

const KIND_STYLE: Record<ProjectMapNodeKind, { width: string; icon: typeof FolderKanban; iconClass: string; border: string }> = {
  project: { width: 'w-[300px]', icon: FolderKanban, iconClass: 'bg-primary-500 text-primary-foreground', border: 'border-primary-500' },
  phase: { width: 'w-[300px]', icon: ListTree, iconClass: 'bg-primary-50 text-primary-700', border: 'border-primary-200' },
  milestone: { width: 'w-[280px]', icon: Flag, iconClass: 'bg-surface-muted text-ink-primary', border: 'border-ink-tertiary' },
  activity: { width: 'w-[260px]', icon: CircleDot, iconClass: 'bg-surface-card text-ink-secondary', border: 'border-border' },
}

const STATUS_STYLE: Partial<Record<ActivityStatus, string>> = {
  NOT_STARTED: 'bg-surface-muted text-ink-primary',
  STARTED: 'bg-primary-50 text-primary-700',
  FINISHED: 'bg-primary-100 text-primary-800',
  APPROVAL_REQUESTED: 'bg-warning-100 text-warning-800',
  APPROVED: 'bg-success-100 text-success-800',
  REJECTED: 'bg-danger-50 text-danger-700',
}

export const ProjectMapNode = memo(({ id, data, selected }: NodeProps<ProjectMapNodeData>) => {
  const style = KIND_STYLE[data.kind]
  const Icon = data.status === 'FINISHED' || data.status === 'APPROVED' ? CheckCircle2 : style.icon
  const statusLabel = data.status && data.status in ACTIVITY_STATUS_LABEL
    ? ACTIVITY_STATUS_LABEL[data.status as ActivityStatus]
    : data.status?.split('_').join(' ')

  return (
    <div className={cn(
      style.width,
      'rounded-lg border bg-card shadow-md transition-shadow',
      style.border,
      selected && 'ring-2 ring-primary-500/25 shadow-lg',
    )}>
      <Handle type="target" position={Position.Top} className="!size-2 !border-surface-card !bg-ink-tertiary" />

      <div className="flex items-start gap-2.5 border-b border-border px-3 py-2.5">
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', style.iconClass)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{data.eyebrow}</div>
          <div className="mt-0.5 line-clamp-2 text-body-sm font-semibold leading-snug text-foreground">{data.title}</div>
        </div>
        {data.hasChildren && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); data.onToggle(id) }}
            className="nodrag flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={data.isExpanded ? `Collapse ${data.title}` : `Expand ${data.title}`}
          >
            {data.isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{data.detail}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(0, Math.min(100, data.progress))}%` }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-foreground">{Math.round(data.progress)}%</div>
          <div className="text-xs text-muted-foreground">{data.childCount} {data.childCount === 1 ? 'item' : 'items'}</div>
        </div>
      </div>

      {(statusLabel || data.ownerParty) && (
        <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
          {statusLabel && (
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[data.status as ActivityStatus] ?? 'bg-muted text-muted-foreground')}>
              {statusLabel}
            </span>
          )}
          {data.ownerParty && <span className="truncate text-xs text-muted-foreground">{data.ownerParty}</span>}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!size-2 !border-surface-card !bg-ink-tertiary" />
    </div>
  )
})

ProjectMapNode.displayName = 'ProjectMapNode'
