'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ChevronRight, User } from 'lucide-react'
import type { FilteredResult, FiltersTab } from '../types'

interface ResultsListProps {
  results: FilteredResult[]
  tab: FiltersTab
  onReset: () => void
}

const STATUS_PILL: Record<string, string> = {
  Done: 'bg-[#16A34A]/10 text-[#16A34A]',
  'In Progress': 'bg-[#2F75B6]/10 text-[#2F75B6]',
  Backlog: 'bg-muted text-muted-foreground',
  Blocked: 'bg-[#DC2626]/10 text-[#DC2626]',
  Ready: 'bg-[#16A34A]/10 text-[#16A34A]',
  Planned: 'bg-muted text-muted-foreground',
  Abandoned: 'bg-muted text-muted-foreground line-through',
}

function ConfidencePill({ confidence }: { confidence?: string }) {
  if (!confidence) return null
  const map: Record<string, { label: string; cls: string }> = {
    ON_TRACK: { label: 'On Track', cls: 'bg-[#16A34A]/10 text-[#16A34A]' },
    AT_RISK: { label: 'At Risk', cls: 'bg-[#F59E0B]/10 text-[#F59E0B]' },
    OFF_TRACK: { label: 'Off Track', cls: 'bg-[#DC2626]/10 text-[#DC2626]' },
  }
  const entry = map[confidence]
  if (!entry) return null
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', entry.cls)}>
      {entry.label}
    </span>
  )
}

function ProgressBar({ progress }: { progress?: number }) {
  if (progress === undefined) return null
  const pct = Math.min(Math.max(progress, 0), 100)
  const colorClass = pct >= 70 ? 'bg-[#16A34A]' : pct >= 40 ? 'bg-[#F59E0B]' : 'bg-[#DC2626]'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', colorClass)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

function groupByPlan(results: FilteredResult[]): Map<string, { planName: string; items: FilteredResult[] }> {
  const map = new Map<string, { planName: string; items: FilteredResult[] }>()
  for (const r of results) {
    if (!map.has(r.planId)) map.set(r.planId, { planName: r.planName, items: [] })
    map.get(r.planId)!.items.push(r)
  }
  return map
}

export function ResultsList({ results, tab, onReset }: ResultsListProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">No results match your filters.</p>
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-primary-600 underline-offset-2 hover:underline"
        >
          Reset filters
        </button>
      </div>
    )
  }

  const grouped = groupByPlan(results)

  const colHeader =
    tab === 'objectives'
      ? ['Objective', 'Plan', 'Progress']
      : tab === 'key-results'
        ? ['Key Result', 'Plan', 'Status']
        : ['Initiative', 'Plan / Key Result', 'Status']

  return (
    <div className="flex-1 overflow-auto">
      {/* Column headers */}
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_160px_140px] gap-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        {colHeader.map((h) => (
          <span key={h} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {h}
          </span>
        ))}
      </div>

      {Array.from(grouped.entries()).map(([planId, { planName, items }]) => (
        <Fragment key={planId}>
          {/* Plan group header */}
          <div className="sticky top-9 z-[5] flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-1.5 backdrop-blur">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {planName}
            </span>
            <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {items.length}
            </span>
          </div>

          {/* Rows */}
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'grid grid-cols-[1fr_160px_140px] items-center gap-4 border-b border-border px-4 py-3 transition-colors hover:bg-muted/40',
                item.workStatus === 'Done' && 'opacity-70'
              )}
            >
              {/* Title */}
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    item.workStatus === 'Done' && 'line-through text-muted-foreground'
                  )}
                >
                  {item.title}
                </span>
                {item.ownerName && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="size-3" />
                    {item.ownerName}
                  </span>
                )}
              </div>

              {/* Plan */}
              <span className="truncate text-xs text-muted-foreground">{item.planName}</span>

              {/* Status / Progress */}
              <div className="flex items-center">
                {tab === 'objectives' ? (
                  <ProgressBar progress={item.progress} />
                ) : tab === 'key-results' ? (
                  <ConfidencePill confidence={item.confidence} />
                ) : (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      STATUS_PILL[item.workStatus ?? ''] ?? 'bg-muted text-muted-foreground'
                    )}
                  >
                    {item.workStatus ?? '—'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  )
}
