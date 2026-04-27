'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Target,
  Calendar,
  Building2,
  ChevronDown,
  ChevronRight,
  Users as UsersIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import ObjectiveActionsMenu from './ObjectiveActionsMenu'

interface NestedObjectivesListProps {
  objectives: any[]
  timeframes: any[]
  departments: any[]
  userRole: string
  showPersonalOnly?: boolean
  showCompanyOnly?: boolean
  showDepartmentOnly?: boolean
}

interface ObjectiveNode {
  objective: any
  children: ObjectiveNode[]
  level: number
}

const LEVEL_LABEL: Record<string, string> = {
  COMPANY: 'COMPANY',
  DEPARTMENT: 'DEPT',
  INDIVIDUAL: 'INDIV',
}

function statusFromValue(progress: number, goalStatus?: string) {
  if (goalStatus === 'COMPLETED') return 'completed'
  if (goalStatus === 'OFF_TRACK') return 'off-track'
  if (goalStatus === 'AT_RISK') return 'at-risk'
  if (goalStatus === 'ON_TRACK') return 'on-track'
  if (progress >= 70) return 'on-track'
  if (progress >= 35) return 'at-risk'
  return 'off-track'
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
    'on-track':  { label: 'On track',  bg: 'rgba(52,199,89,0.12)', fg: 'var(--ap-green)',  dot: 'var(--ap-green)' },
    'at-risk':   { label: 'At risk',   bg: 'rgba(255,149,0,0.12)', fg: 'var(--ap-orange)', dot: 'var(--ap-orange)' },
    'off-track': { label: 'Off track', bg: 'rgba(255,59,48,0.12)', fg: 'var(--ap-red)',    dot: 'var(--ap-red)' },
    completed:   { label: 'Done',      bg: 'rgba(0,122,255,0.12)', fg: 'var(--ap-accent)', dot: 'var(--ap-accent)' },
  }
  const c = map[status] ?? map['off-track']
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  )
}

function LevelBadge({ level }: { level: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
    >
      {LEVEL_LABEL[level] ?? level}
    </span>
  )
}

function ProgressBar({ value, status }: { value: number; status: string }) {
  const color =
    status === 'on-track' || status === 'completed' ? 'var(--ap-green)'
    : status === 'at-risk' ? 'var(--ap-orange)'
    : 'var(--ap-red)'
  return (
    <div className="flex items-center gap-2 w-[140px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ap-kr-bar-bg)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, background: color }}
        />
      </div>
      <span className="text-[12px] font-semibold tabular-nums w-[34px] text-right">
        {Math.round(value)}%
      </span>
    </div>
  )
}

function OwnerChip({ owner }: { owner: any }) {
  const initial = (owner?.name ?? '?')[0]?.toUpperCase() ?? '?'
  return (
    <span className="flex items-center gap-1.5 max-w-[140px]">
      {owner?.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={owner.avatar} alt="" className="size-5 rounded-full object-cover" />
      ) : (
        <span
          className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: 'var(--ap-accent)' }}
        >
          {initial}
        </span>
      )}
      <span className="truncate text-[12px]" style={{ color: 'var(--ap-fg-muted)' }}>
        {owner?.name ?? 'Unassigned'}
      </span>
    </span>
  )
}

export default function NestedObjectivesList({
  objectives,
}: NestedObjectivesListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tree = useMemo(() => {
    const childMap = new Map<string, any[]>()
    objectives.forEach((obj) => {
      if (obj.parentObjectiveId) {
        if (!childMap.has(obj.parentObjectiveId)) childMap.set(obj.parentObjectiveId, [])
        childMap.get(obj.parentObjectiveId)!.push(obj)
      }
    })

    const ORDER: Record<string, number> = { COMPANY: 0, DEPARTMENT: 1, INDIVIDUAL: 2 }
    const sortFn = (a: any, b: any) => (ORDER[a.level] ?? 3) - (ORDER[b.level] ?? 3)

    const build = (obj: any, depth: number): ObjectiveNode => ({
      objective: obj,
      level: depth,
      children: (childMap.get(obj.id) ?? []).sort(sortFn).map((c) => build(c, depth + 1)),
    })

    const roots = objectives
      .filter((o) => o.level === 'COMPANY' || !o.parentObjectiveId)
      .sort(sortFn)

    return roots.map((o) => build(o, 0))
  }, [objectives])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })

  const renderNode = (node: ObjectiveNode) => {
    const { objective: obj, level, children } = node
    const isOpen = expanded.has(obj.id)
    const krs: any[] = Array.isArray(obj.keyResults) ? obj.keyResults : []
    const krCount = obj._count?.keyResults ?? krs.length
    const hasKids = children.length > 0 || krCount > 0
    const indent = level * 18
    const status = statusFromValue(obj.progress ?? 0, obj.goalStatus)
    const isArchived = obj.status === 'ARCHIVED'

    return (
      <div key={obj.id}>
        <div
          className={cn(
            'group ap-hover-lift rounded-[14px] border bg-card transition-all mb-2 hover:shadow-sm',
            isArchived && 'opacity-70 grayscale-[40%]'
          )}
          style={{ marginLeft: `${indent}px`, borderColor: 'var(--ap-border)' }}
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => toggle(obj.id)}
              className={cn(
                'shrink-0 mt-0.5 inline-flex size-5 items-center justify-center rounded hover:bg-muted',
                !hasKids && 'invisible'
              )}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen
                ? <ChevronDown className="size-3.5 text-muted-foreground" />
                : <ChevronRight className="size-3.5 text-muted-foreground" />}
            </button>

            <div className="min-w-0 flex-1">
              {/* Top chip row */}
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <LevelBadge level={obj.level} />
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {obj.id.slice(-6).toUpperCase()}
                </span>
                {obj.timeframe?.name && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                    style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
                  >
                    <Calendar className="size-2.5" />
                    {obj.timeframe.name}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <StatusPill status={status} />
                </div>
              </div>

              {/* Title */}
              <Link
                href={`/dashboard/objectives/${obj.id}`}
                className="block text-[15px] font-semibold leading-tight hover:underline truncate"
                style={{ letterSpacing: '-0.01em' }}
                title={obj.title}
              >
                {obj.title}
              </Link>

              {obj.description && (
                <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-1">
                  {obj.description}
                </p>
              )}

              {/* Meta row */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <OwnerChip owner={obj.owner} />
                {obj.department && (
                  <>
                    <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
                    <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                      <Building2 className="size-3" />
                      <span className="truncate max-w-[120px]">{obj.department.name}</span>
                    </span>
                  </>
                )}
                <span className="hidden sm:inline-block h-3 w-px" style={{ background: 'var(--ap-border)' }} />
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
                >
                  <UsersIcon className="size-2.5" />
                  {krCount} KR{krCount !== 1 ? 's' : ''}
                </span>
                {obj.parentObjective && (
                  <Link
                    href={`/dashboard/objectives/${obj.parentObjective.id}`}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium truncate max-w-[200px]"
                    style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
                    title={obj.parentObjective.title}
                  >
                    ↑ {obj.parentObjective.title}
                  </Link>
                )}
                <div className="ml-auto">
                  <ProgressBar value={obj.progress ?? 0} status={status} />
                </div>
              </div>
            </div>

            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ObjectiveActionsMenu objective={obj} />
            </div>
          </div>
        </div>

        {/* KRs */}
        {isOpen && krs.length > 0 && (
          <div className="mb-2 space-y-1.5" style={{ marginLeft: `${indent + 28}px` }}>
            {krs.map((kr: any) => {
              const krStatus = statusFromValue(kr.progress ?? 0, kr.goalStatus)
              return (
                <Link
                  key={kr.id}
                  href={`/dashboard/key-results/${kr.id}`}
                  className="flex items-center gap-3 rounded-[10px] border bg-card px-3 py-2 hover:shadow-sm transition-all"
                  style={{ borderColor: 'var(--ap-border)' }}
                >
                  <span
                    className="shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase"
                    style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
                  >
                    KR
                  </span>
                  <span
                    className="flex-1 min-w-0 text-[13px] truncate"
                    title={kr.title}
                    style={{ color: 'var(--ap-fg)' }}
                  >
                    {kr.title}
                  </span>
                  {kr.owner && <OwnerChip owner={kr.owner} />}
                  <ProgressBar value={kr.progress ?? 0} status={krStatus} />
                </Link>
              )
            })}
          </div>
        )}

        {/* Children */}
        {isOpen && children.length > 0 && (
          <div className="mb-2">
            {children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No objectives found"
        description={
          objectives.length === 0
            ? 'Create your first objective to get started.'
            : 'Try adjusting your filters.'
        }
      />
    )
  }

  return <div>{tree.map((node) => renderNode(node))}</div>
}
