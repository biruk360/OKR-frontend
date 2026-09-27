'use client'

/**
 * Tab switcher + filter controls + preset/dynamic filter chips for the
 * /dashboard/reports results card. Split out of ReportDashboardClient.tsx
 * (2026-09-25). The native selects are now FilterSelect, and the hand-rolled
 * "Add filter" click-catcher menus are one DropdownMenu with a submenu per
 * filter type (Radix: outside-click, Esc, focus return, keyboard nav).
 */
import { Filter, RotateCcw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FilterSelect } from '@/components/ui/FilterSelect'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ReportSegmented } from './ReportSegmented'
import type { DynamicFilter, FilterOptions, MainTab, SortKey } from './report-dashboard-utils'

const PRESETS = [
  { id: 'all-key-results', label: 'All KRs' },
  { id: 'your-key-results', label: 'Your KRs' },
  { id: 'owned', label: 'Owned' },
  { id: 'contributing', label: 'Contributing' },
  { id: 'all-off-track', label: 'Off track' },
  { id: 'all-at-risk', label: 'At risk' },
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
]

const PLAN_STATUS_OPTIONS = [
  { value: 'ON_TRACK', label: 'On track' },
  { value: 'AT_RISK', label: 'At risk' },
  { value: 'OFF_TRACK', label: 'Off track' },
  { value: 'CLOSED', label: 'Closed' },
]

const CONFIDENCE_OPTIONS = [
  { value: 'ON_TRACK', label: 'On track' },
  { value: 'AT_RISK', label: 'At risk' },
  { value: 'OFF_TRACK', label: 'Off track' },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'objective', label: 'Objective' },
  { value: 'progress', label: 'Progress' },
  { value: 'status', label: 'Status' },
]

const DYNAMIC_FILTER_TYPES = ['user', 'department', 'timeframe', 'confidence', 'status'] as const

interface Props {
  mainTab: MainTab
  onMainTabChange: (tab: MainTab) => void
  query: string
  onQueryChange: (q: string) => void
  planStatus: string
  onPlanStatusChange: (v: string) => void
  confidenceFilter: string
  onConfidenceFilterChange: (v: string) => void
  sortBy: SortKey
  onSortByChange: (v: SortKey) => void
  onReset: () => void
  activePreset: string
  onApplyPreset: (id: string) => void
  dynamicFilters: DynamicFilter[]
  onAddDynamicFilter: (type: string, id: string, label: string) => void
  onRemoveDynamicFilter: (type: string, id: string) => void
  onClearDynamicFilters: () => void
  filterOptions?: FilterOptions
}

export function ReportFilterStrip({
  mainTab,
  onMainTabChange,
  query,
  onQueryChange,
  planStatus,
  onPlanStatusChange,
  confidenceFilter,
  onConfidenceFilterChange,
  sortBy,
  onSortByChange,
  onReset,
  activePreset,
  onApplyPreset,
  dynamicFilters,
  onAddDynamicFilter,
  onRemoveDynamicFilter,
  onClearDynamicFilters,
  filterOptions,
}: Props) {
  const optionsFor = (type: (typeof DYNAMIC_FILTER_TYPES)[number]): Array<{ id: string; name: string }> => {
    switch (type) {
      case 'user': return filterOptions?.users ?? []
      case 'department': return filterOptions?.departments ?? []
      case 'timeframe': return filterOptions?.timeframes ?? []
      case 'confidence': return CONFIDENCE_OPTIONS.map((o) => ({ id: o.value, name: o.label }))
      case 'status': return [{ id: 'ACTIVE', name: 'Active' }, { id: 'DRAFT', name: 'Draft' }]
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b no-print" style={{ borderColor: 'var(--ap-border)' }}>
        <ReportSegmented
          label="Result type"
          value={mainTab}
          onChange={onMainTabChange}
          options={[
            { value: 'objectives', label: 'Objectives' },
            { value: 'key-results', label: 'Key results' },
            { value: 'initiatives', label: 'Initiatives' },
          ]}
        />
        <div className="relative ml-1 flex-1 min-w-[180px] max-w-[320px]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            placeholder="Search objectives, KRs, plans…"
            aria-label="Search objectives, key results and plans"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="h-9 w-full rounded-[var(--ap-radius-sm)] border bg-background pl-7 pr-2 text-xs outline-none"
            style={{ borderColor: 'var(--ap-border)' }}
          />
        </div>
        <FilterSelect
          label="Plan status"
          placeholder="All"
          value={planStatus === 'all' ? undefined : planStatus}
          onValueChange={(v) => onPlanStatusChange(v ?? 'all')}
          options={PLAN_STATUS_OPTIONS}
        />
        <FilterSelect
          label="Confidence"
          placeholder="All"
          value={confidenceFilter === 'all' ? undefined : confidenceFilter}
          onValueChange={(v) => onConfidenceFilterChange(v ?? 'all')}
          options={CONFIDENCE_OPTIONS}
        />
        <FilterSelect
          label="Sort"
          value={sortBy}
          clearable={false}
          onValueChange={(v) => { if (v) onSortByChange(v as SortKey) }}
          options={SORT_OPTIONS}
          disabled={mainTab !== 'key-results'}
        />
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 h-7 rounded-[var(--ap-radius-sm)] px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset
        </button>
      </div>

      {/* Preset chip strip */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b no-print" style={{ borderColor: 'var(--ap-border)' }}>
        {PRESETS.map((p) => {
          const active = activePreset === p.id
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => onApplyPreset(p.id)}
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-caption font-medium border transition',
                !active && 'text-muted-foreground hover:text-foreground'
              )}
              style={
                active
                  ? { background: 'var(--ap-accent)', borderColor: 'var(--ap-accent)', color: 'var(--ap-accent-fg)' }
                  : { borderColor: 'var(--ap-border)', background: 'transparent' }
              }
            >
              {p.label}
            </button>
          )
        })}

        {/* Dynamic filter chips */}
        {dynamicFilters.map((f) => (
          <span
            key={`${f.type}-${f.id}`}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-caption font-medium text-muted-foreground"
            style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
          >
            <span className="capitalize">{f.type}:</span> {f.label}
            <button
              type="button"
              onClick={() => onRemoveDynamicFilter(f.type, f.id)}
              aria-label={`Remove ${f.type} filter ${f.label}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-1 text-caption text-muted-foreground hover:text-foreground"
              style={{ borderColor: 'var(--ap-border)' }}
            >
              <Filter className="h-3 w-3" aria-hidden /> Add filter
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[160px]">
            {DYNAMIC_FILTER_TYPES.map((type) => {
              const options = optionsFor(type)
              return (
                <DropdownMenuSub key={type}>
                  <DropdownMenuSubTrigger className="text-xs capitalize">{type}</DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-h-[240px] min-w-[200px] overflow-auto">
                      {options.length === 0 ? (
                        <DropdownMenuItem disabled className="text-xs">No options</DropdownMenuItem>
                      ) : options.map((o) => (
                        <DropdownMenuItem
                          key={o.id}
                          className="text-xs"
                          onSelect={() => onAddDynamicFilter(type, o.id, o.name)}
                        >
                          <span className="truncate">{o.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {dynamicFilters.length > 0 && (
          <button
            type="button"
            onClick={onClearDynamicFilters}
            className="text-caption text-muted-foreground hover:text-foreground"
          >
            Clear chips
          </button>
        )}
      </div>
    </>
  )
}
