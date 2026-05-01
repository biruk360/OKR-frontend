'use client'

import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilteredResult, FiltersTab } from '../types'

interface ResultsListProps {
  results: FilteredResult[]
  tab: FiltersTab
  onReset: () => void
}

const CONFIDENCE_PILL: Record<string, { label: string; cls: string }> = {
  ON_TRACK:  { label: 'On Track',  cls: 'bg-green-50  text-green-700  border border-green-200'  },
  AT_RISK:   { label: 'At Risk',   cls: 'bg-amber-50  text-amber-700  border border-amber-200'  },
  OFF_TRACK: { label: 'Off Track', cls: 'bg-red-50    text-red-700    border border-red-200'    },
}

const WORK_STATUS_PILL: Record<string, string> = {
  Done:         'bg-green-50  text-green-700  border border-green-200',
  'In Progress':'bg-blue-50   text-blue-700   border border-blue-200',
  'In Review':  'bg-violet-50 text-violet-700 border border-violet-200',
  Ready:        'bg-green-50  text-green-700  border border-green-200',
  Blocked:      'bg-red-50    text-red-700    border border-red-200',
  Backlog:      'bg-muted     text-muted-foreground border border-border',
  Planned:      'bg-muted     text-muted-foreground border border-border',
  Abandoned:    'bg-muted     text-muted-foreground border border-border',
}

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.min(Math.max(progress, 0), 100)
  const color = pct >= 70 ? '#16A34A' : pct >= 40 ? '#F59E0B' : '#DC2626'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}

function groupByPlan(results: FilteredResult[]) {
  const map = new Map<string, { planName: string; items: FilteredResult[] }>()
  for (const r of results) {
    const key = r.planId || 'unknown'
    if (!map.has(key)) map.set(key, { planName: r.planName || 'No Plan', items: [] })
    map.get(key)!.items.push(r)
  }
  return map
}

const COL_HEADERS: Record<FiltersTab, [string, string, string]> = {
  objectives:    ['Objective',  'Owner', 'Progress'],
  'key-results': ['Key Result', 'Owner', 'Status'],
  initiatives:   ['Initiative', 'Owner', 'Status'],
}

export function ResultsList({ results, tab, onReset }: ResultsListProps) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">No results match your filters.</p>
        <button type="button" onClick={onReset} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          Reset filters
        </button>
      </div>
    )
  }

  const grouped = groupByPlan(results)
  const [col1, col2, col3] = COL_HEADERS[tab]

  return (
    <div className="flex-1 overflow-auto">
      {/* ── Column headers ── */}
      <div className="sticky top-0 z-10 flex items-center border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col1}</span>
        <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col2}</span>
        <span className="w-36 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{col3}</span>
      </div>

      {Array.from(grouped.entries()).map(([planId, { planName, items }]) => (
        <Fragment key={planId}>
          {/* ── Plan group header ── */}
          <div className="sticky top-9 z-[5] flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-1.5">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{planName}</span>
            <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border">
              {items.length}
            </span>
          </div>

          {/* ── Rows ── */}
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex items-center border-b border-border px-4 py-3 transition-colors hover:bg-muted/40',
                item.workStatus === 'Done' && 'opacity-60'
              )}
            >
              {/* Col 1 – title */}
              <div className="min-w-0 flex-1 pr-4">
                <p
                  className={cn(
                    'truncate text-sm font-medium',
                    item.workStatus === 'Done' && 'line-through text-muted-foreground'
                  )}
                  title={item.title}
                >
                  {item.title}
                </p>
              </div>

              {/* Col 2 – owner */}
              <div className="flex w-40 shrink-0 items-center gap-1.5 overflow-hidden pr-4">
                {item.ownerName ? (
                  <>
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                      {item.ownerName.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{item.ownerName}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>

              {/* Col 3 – status / progress */}
              <div className="w-36 shrink-0">
                {tab === 'objectives' ? (
                  <ProgressBar progress={item.progress ?? 0} />
                ) : tab === 'key-results' ? (
                  (() => {
                    const pill = item.confidence ? CONFIDENCE_PILL[item.confidence] : null
                    return pill ? (
                      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', pill.cls)}>
                        {pill.label}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        Pending
                      </span>
                    )
                  })()
                ) : (
                  <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', WORK_STATUS_PILL[item.workStatus ?? ''] ?? 'bg-muted text-muted-foreground border border-border')}>
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
