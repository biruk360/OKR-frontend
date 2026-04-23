'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { getProgressColor } from '@/lib/utils'
import {
  Target,
  Calendar,
  User,
  Building2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
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

const LEVEL_BADGE: Record<string, string> = {
  COMPANY:    'bg-blue-50 text-blue-700 border border-blue-200',
  DEPARTMENT: 'bg-amber-50 text-amber-700 border border-amber-200',
  INDIVIDUAL: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
}
const LEVEL_LABEL: Record<string, string> = {
  COMPANY: 'Co', DEPARTMENT: 'Dept', INDIVIDUAL: 'Me',
}

function progressBarColor(p: number): string {
  if (p >= 70) return 'bg-emerald-500'
  if (p >= 35) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function NestedObjectivesList({
  objectives,
  timeframes,
  departments,
  userRole,
}: NestedObjectivesListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const tree = useMemo(() => {
    const childMap = new Map<string, any[]>()
    objectives.forEach(obj => {
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
      children: (childMap.get(obj.id) ?? []).sort(sortFn).map(c => build(c, depth + 1)),
    })

    const roots = objectives
      .filter(o => o.level === 'COMPANY' || !o.parentObjectiveId)
      .sort(sortFn)

    return roots.map(o => build(o, 0))
  }, [objectives])

  const toggle = (id: string) =>
    setExpanded(prev => {
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
    const indent = level * 20

    return (
      <div key={obj.id}>
        <div
          className="group bg-card border border-border rounded-lg hover:border-border/80 hover:shadow-sm transition-all mb-1.5"
          style={{ marginLeft: `${indent}px` }}
        >
          {/* Single compact row */}
          <div className="flex items-center gap-2 px-3 py-2.5 min-w-0">

            {/* Expand toggle */}
            <button
              onClick={() => toggle(obj.id)}
              className={`shrink-0 p-0.5 rounded hover:bg-muted transition-colors ${hasKids ? 'visible' : 'invisible'}`}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen
                ? <ChevronDown className="size-3.5 text-muted-foreground" />
                : <ChevronRight className="size-3.5 text-muted-foreground" />}
            </button>

            {/* Level badge */}
            <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEVEL_BADGE[obj.level] ?? 'bg-muted text-foreground'}`}>
              {LEVEL_LABEL[obj.level] ?? obj.level}
            </span>

            {/* Title — truncate but show on hover via title attr */}
            <Link
              href={`/dashboard/objectives/${obj.id}`}
              className="flex-1 min-w-0 text-sm font-medium text-foreground hover:text-primary truncate"
              title={obj.title}
            >
              {obj.title}
            </Link>

            {/* Meta pills — hidden on mobile, shown sm+ */}
            <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
              {/* Owner */}
              <span className="flex items-center gap-1 max-w-[100px]">
                {obj.owner.avatar
                  ? <img src={obj.owner.avatar} alt="" className="size-4 rounded-full object-cover" />
                  : <div className="size-4 rounded-full bg-primary flex items-center justify-center text-[9px] text-primary-foreground font-bold">{(obj.owner.name ?? '?')[0]}</div>
                }
                <span className="truncate max-w-[72px]">{obj.owner.name}</span>
              </span>

              {/* Timeframe */}
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Calendar className="size-3 shrink-0" />
                {obj.timeframe?.name}
              </span>

              {/* Dept */}
              {obj.department && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Building2 className="size-3 shrink-0" />
                  {obj.department.name}
                </span>
              )}

              {/* KR count */}
              <span className="text-[11px] tabular-nums whitespace-nowrap">
                {obj._count?.keyResults ?? 0} KR{(obj._count?.keyResults ?? 0) !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Progress */}
            <div className="shrink-0 flex items-center gap-2 w-[80px]">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressBarColor(obj.progress)}`}
                  style={{ width: `${Math.min(obj.progress, 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums w-[28px] text-right text-foreground">
                {Math.round(obj.progress)}%
              </span>
            </div>

            {/* Actions — shown on row hover */}
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ObjectiveActionsMenu objective={obj} />
            </div>
          </div>

          {/* Parent link — only if aligned, shown below title row */}
          {obj.parentObjective && (
            <div className="px-3 pb-2 -mt-1 ml-7">
              <Link
                href={`/dashboard/objectives/${obj.parentObjective.id}`}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary truncate max-w-full"
                title={`Aligned to: ${obj.parentObjective.title}`}
              >
                <span className="shrink-0">↑</span>
                <span className="truncate">{obj.parentObjective.title}</span>
              </Link>
            </div>
          )}
        </div>

        {/* Key results (shown before child objectives when expanded) */}
        {isOpen && krs.length > 0 && (
          <div
            className="mb-1.5 space-y-1"
            style={{ marginLeft: `${indent + 28}px` }}
          >
            {krs.map((kr: any) => (
              <Link
                key={kr.id}
                href={`/dashboard/key-results/${kr.id}`}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 hover:border-border/80 hover:shadow-sm transition-all"
              >
                <span className="shrink-0 inline-flex items-center rounded bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  KR
                </span>
                <span className="flex-1 min-w-0 text-sm text-foreground truncate" title={kr.title}>
                  {kr.title}
                </span>
                {kr.owner && (
                  <span className="hidden sm:flex items-center gap-1 shrink-0 text-xs text-muted-foreground max-w-[100px]">
                    {kr.owner.avatar ? (
                      <img src={kr.owner.avatar} alt="" className="size-4 rounded-full object-cover" />
                    ) : (
                      <div className="size-4 rounded-full bg-primary flex items-center justify-center text-[9px] text-primary-foreground font-bold">
                        {(kr.owner.name ?? '?')[0]}
                      </div>
                    )}
                    <span className="truncate max-w-[72px]">{kr.owner.name}</span>
                  </span>
                )}
                <div className="shrink-0 flex items-center gap-2 w-[80px]">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${progressBarColor(kr.progress ?? 0)}`}
                      style={{ width: `${Math.min(kr.progress ?? 0, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums w-[28px] text-right text-foreground">
                    {Math.round(kr.progress ?? 0)}%
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Child objectives */}
        {isOpen && children.length > 0 && (
          <div className="mb-1.5">
            {children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    )
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Target className="size-10 text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium text-foreground">No objectives found</p>
        <p className="text-xs text-muted-foreground mt-1">
          {objectives.length === 0
            ? 'Create your first objective to get started.'
            : 'Try adjusting your filters.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      {tree.map(node => renderNode(node))}
    </div>
  )
}
