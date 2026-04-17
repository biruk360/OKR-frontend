'use client'

import { memo, useMemo, useState } from 'react'
import Link from 'next/link'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  User,
} from 'lucide-react'

export interface PlanMetrics {
  avgKrProgress: number
  initiativeDone: number
  initiativeTotal: number
  ncsScore: number
}

interface KeyResultRow {
  id: string
  title: string
  progress: number
  currentValue: number
  targetValue: number
  unit: string
  confidence: string
}

export interface AlignmentHint {
  parentTitle: string
  parentLevel?: string
}

export interface ObjectiveNodeData {
  id: string
  title: string
  description?: string | null
  level: 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'
  goalStatus: string
  progress: number
  owner: {
    id: string
    name: string
    avatar?: string | null
  }
  department?: {
    id: string
    name: string
  } | null
  /** When set, this objective is a child on the map (sub-OKR / aligned plan). */
  alignmentHint?: AlignmentHint
  keyResultsCount: number
  childObjectivesCount: number
  isExpanded: boolean
  onToggleExpand: (id: string) => void
  /** @deprecated kept for React Flow node data compatibility */
  onToggleKR?: (id: string) => void
  /** @deprecated */
  isKRExpanded?: boolean
  keyResults: KeyResultRow[]
  metrics: PlanMetrics
  timeframeName?: string
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ON_TRACK: { label: 'On track', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20' },
  AT_RISK: { label: 'At risk', className: 'bg-amber-50 text-amber-900 ring-amber-600/25' },
  OFF_TRACK: { label: 'Behind', className: 'bg-red-50 text-red-800 ring-red-600/20' },
  CLOSED: { label: 'Closed', className: 'bg-muted text-muted-foreground ring-gray-500/20' },
}

function confidenceDot(confidence: string) {
  switch (confidence) {
    case 'ON_TRACK':
      return 'bg-[#28a745]'
    case 'AT_RISK':
      return 'bg-[#fd7e14]'
    case 'OFF_TRACK':
      return 'bg-[#dc3545]'
    default:
      return 'bg-gray-400'
  }
}

function formatKrValue(value: number, unit: string) {
  const u = unit || '%'
  if (u === '%') return `${Math.round(value)}%`
  if (u === 'NPS') return `${Math.round(value)} NPS`
  if (['Revenue', 'Sales', '$', 'ETB'].some((x) => u.includes(x) || u === x))
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${u}`
  return `${value % 1 === 0 ? Math.round(value) : value.toFixed(1)} ${u}`.trim()
}

const ObjectiveNode = memo(({ data, selected }: NodeProps<ObjectiveNodeData>) => {
  const {
    title,
    level,
    goalStatus,
    owner,
    department,
    alignmentHint,
    childObjectivesCount,
    isExpanded,
    onToggleExpand,
    keyResults,
    metrics,
    timeframeName,
  } = data

  const [contentOpen, setContentOpen] = useState(true)

  const planLabel = useMemo(() => {
    switch (level) {
      case 'COMPANY':
        return 'Company OKR'
      case 'DEPARTMENT':
        return department?.name ? `${department.name} OKR` : 'Department OKR'
      default:
        return `${owner?.name ?? 'Individual'} OKR`
    }
  }, [level, department?.name, owner?.name])

  const PlanIcon = level === 'COMPANY' ? Building2 : level === 'DEPARTMENT' ? Lightbulb : User

  const badge = STATUS_BADGE[goalStatus] ?? {
    label: 'In progress',
    className: 'bg-indigo-50 text-indigo-800 ring-indigo-600/20',
  }

  const hierarchySubtitle = useMemo(() => {
    if (alignmentHint?.parentTitle) {
      const under = alignmentHint.parentTitle.length > 42
        ? `${alignmentHint.parentTitle.slice(0, 40)}…`
        : alignmentHint.parentTitle
      if (alignmentHint.parentLevel === 'COMPANY') {
        return { line1: 'Sub-OKR', line2: `Under: ${under}` }
      }
      return { line1: 'Aligned OKR', line2: `Under: ${under}` }
    }
    const tf = timeframeName ? ` · ${timeframeName}` : ''
    return { line1: `${planLabel}${tf}`, line2: null as string | null }
  }, [alignmentHint, planLabel, timeframeName])

  const initiativeLabel =
    metrics.initiativeTotal > 0
      ? `${metrics.initiativeDone}/${metrics.initiativeTotal}`
      : '—'

  return (
    <div
      className={`flex max-w-[420px] min-w-[360px] flex-col rounded-xl border bg-card shadow-md ${
        selected ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-border'
      }`}
    >
      <div className="border-b border-border px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <PlanIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {hierarchySubtitle.line1}
              </p>
              {hierarchySubtitle.line2 ? (
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hierarchySubtitle.line2}</p>
              ) : null}
              <h3 className="mt-0.5 line-clamp-3 text-[15px] font-semibold leading-snug text-foreground">
                {title}
              </h3>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Key results</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{metrics.avgKrProgress}%</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#0d6efd]"
              style={{ width: `${Math.min(metrics.avgKrProgress, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Initiatives</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{initiativeLabel}</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#198754]"
              style={{
                width:
                  metrics.initiativeTotal > 0
                    ? `${(100 * metrics.initiativeDone) / metrics.initiativeTotal}%`
                    : '0%',
              }}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Confidence</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">{metrics.ncsScore} NCS</p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#fd7e14]"
              style={{ width: `${Math.min(metrics.ncsScore, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="px-2 py-1">
        <button
          type="button"
          onClick={() => setContentOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          <span>{contentOpen ? 'Hide plan content' : 'Show plan content'}</span>
          {contentOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {contentOpen && keyResults.length > 0 && (
        <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto border-t border-border px-4 py-3">
          <p className="text-xs font-semibold text-foreground">
            Key results ({keyResults.length})
          </p>
          <ul className="space-y-2">
            {keyResults.map((kr) => (
              <li
                key={kr.id}
                className="flex items-start justify-between gap-2 border-b border-gray-50 pb-2 last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-sm ${confidenceDot(kr.confidence)}`}
                    title={kr.confidence}
                  />
                  <span className="text-xs leading-snug text-foreground">{kr.title}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-xs font-medium tabular-nums text-foreground">
                    {formatKrValue(kr.currentValue, kr.unit)}
                  </span>
                  <div className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#0d6efd]"
                      style={{ width: `${Math.min(kr.progress, 100)}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {contentOpen && keyResults.length === 0 && (
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          No key results yet. Open the objective and add key results to see them here.
        </div>
      )}

      <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-2">
        <Link
          href={`/dashboard/objectives/${data.id}`}
          className="px-2 py-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Open detail
        </Link>
        {childObjectivesCount > 0 && (
          <button
            type="button"
            onClick={() => onToggleExpand(data.id)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            title={isExpanded ? 'Collapse aligned plans' : 'Expand aligned plans'}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-gray-400" />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-gray-400"
        style={{ opacity: 1 }}
      />
    </div>
  )
})

ObjectiveNode.displayName = 'ObjectiveNode'

export default ObjectiveNode
