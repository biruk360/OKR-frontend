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
  project: { width: 'w-[300px]', icon: FolderKanban, iconClass: 'bg-blue-600 text-white', border: 'border-blue-500' },
  phase: { width: 'w-[300px]', icon: ListTree, iconClass: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  milestone: { width: 'w-[280px]', icon: Flag, iconClass: 'bg-slate-100 text-slate-700', border: 'border-slate-300' },
  activity: { width: 'w-[260px]', icon: CircleDot, iconClass: 'bg-white text-slate-600', border: 'border-slate-200' },
}

const STATUS_STYLE: Partial<Record<ActivityStatus, string>> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700',
  STARTED: 'bg-sky-100 text-sky-800',
  FINISHED: 'bg-blue-100 text-blue-800',
  APPROVAL_REQUESTED: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-orange-100 text-orange-900',
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
      selected && 'ring-2 ring-blue-500/25 shadow-lg',
    )}>
      <Handle type="target" position={Position.Top} className="!size-2 !border-white !bg-slate-400" />

      <div className="flex items-start gap-2.5 border-b border-border px-3 py-2.5">
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', style.iconClass)}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{data.eyebrow}</div>
          <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{data.title}</div>
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
          <div className="truncate text-[11px] text-muted-foreground">{data.detail}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, data.progress))}%` }} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums text-foreground">{Math.round(data.progress)}%</div>
          <div className="text-[10px] text-muted-foreground">{data.childCount} {data.childCount === 1 ? 'item' : 'items'}</div>
        </div>
      </div>

      {(statusLabel || data.ownerParty) && (
        <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
          {statusLabel && (
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', STATUS_STYLE[data.status as ActivityStatus] ?? 'bg-muted text-muted-foreground')}>
              {statusLabel}
            </span>
          )}
          {data.ownerParty && <span className="truncate text-[10px] text-muted-foreground">{data.ownerParty}</span>}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!size-2 !border-white !bg-slate-400" />
    </div>
  )
})

ProjectMapNode.displayName = 'ProjectMapNode'
