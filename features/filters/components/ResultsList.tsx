'use client'

import { Fragment } from 'react'
import { ChevronRight, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilteredResult, FiltersTab } from '../types'

interface ResultsListProps {
  results: FilteredResult[]
  tab: FiltersTab
  onReset: () => void
}

const CONFIDENCE_PILL: Record<string, string> = {
  ON_TRACK: 'bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20',
  AT_RISK: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20',
  OFF_TRACK: 'bg-[#DC2626]/10 text-[#DC2626] border border-[#DC2626]/20',
}
const CONFIDENCE_LABEL: Record<string, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  OFF_TRACK: 'Off Track',
}

const WORK_STATUS_PILL: Record<string, string> = {
  Done: 'bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20',
  'In Progress': 'bg-[#2F75B6]/10 text-[#2F75B6] border border-[#2F75B6]/20',
  'In Review': 'bg-[#7C3AED]/10 text-[#7C3AED] border border-[#7C3AED]/20',
  Ready: 'bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20',
  Blocked: 'bg-[#DC2626]/10 text-[#DC2626] border border-[#DC2626]/20',
  Backlog: 'bg-muted text-muted-foreground border border-border',
  Planned: 'bg-muted text-muted-foreground border border-border',
  Abandoned: 'bg-muted text-muted-foreground border border-border',
}

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.min(Math.max(progress, 0), 100)
  const color = pct >= 70 ? '#16A34A' : pct >= 40 ? '#F59E0B' : '#DC2626'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

function groupByPlan(results: FilteredResult[]): Map<string, { planName: string; items: FilteredResult[] }> {
  const map = new Map<string, { planName: string; items: FilteredResult[] }>()
  for (const r of results) {
    const key = r.planId || 'unknown'
    if (!map.has(key)) map.set(key, { planName: r.planName || 'No Plan', items: [] })
    map.get(key)!.items.push(r)
  }
  return map
}

const COL_HEADERS: Record<FiltersTab, string[]> = {
  objectives: ['Objective', 'Owner', 'Progress'],
  'key-results': ['Key Result', 'Owner', 'Status'],
  initiatives: ['Initiative', 'Owner', 'Status'],
}

export function ResultsList({ results, tab, onReset }: ResultsListProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">No results match your filters.</p>
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Reset filters
        </button>
      </div>
    )
  }

  const grouped = groupByPlan(results)
  const [col1, col2, col3] = COL_HEADERS[tab]

  return (
    <div className="flex-1 overflow-auto">
      {/* Column headers */}
      <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_140px_140px] border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col1}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col2}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col3}</span>
      </div>

      {Array.from(grouped.entries()).map(([planId, { planName, items }]) => (
        <Fragment key={planId}>
          {/* Plan group header */}
          <div className="sticky top-9 z-[5] flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-1.5">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {planName}
            </span>
            <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border">
              {items.length}
            </span>
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_140px_140px] items-center border-b border-border px-4 py-3 transition-colors hover:bg-muted/40',
                item.workStatus === 'Done' && 'opacity-60'
              )}
            >
              {/* Col 1: Title */}
              <span
                className={cn(
                  'truncate text-sm font-medium',
                  item.workStatus === 'Done' && 'line-through text-muted-foreground'
                )}
                title={item.title}
              >
                {item.title}
              </span>

              {/* Col 2: Owner */}
              <div className="flex items-center gap-1.5 overflow-hidden">
                {item.ownerName ? (
                  <>
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                      {item.ownerName.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate text-xs text-muted-foreground">{item.ownerName}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/50">—</span>
                )}
              </div>

              {/* Col 3: Status / Progress */}
              <div>
                {tab === 'objectives' ? (
                  <ProgressBar progress={item.progress ?? 0} />
                ) : tab === 'key-results' ? (
                  item.confidence ? (
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', CONFIDENCE_PILL[item.confidence] ?? 'bg-muted text-muted-foreground border border-border')}>
                      {CONFIDENCE_LABEL[item.confidence] ?? item.confidence}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Pending
                    </span>
                  )
                ) : (
                  <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', WORK_STATUS_PILL[item.workStatus ?? ''] ?? 'bg-muted text-muted-foreground border border-border')}>
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
