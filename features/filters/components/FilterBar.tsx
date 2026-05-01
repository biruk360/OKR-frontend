'use client'

import { useState } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFilterOptions } from '../hooks/useFilterOptions'
import type { FilterState, FiltersTab } from '../types'

// ─── Catalog definition ──────────────────────────────────────────────────────

type OptionItem = { id: string; label: string }
type FilterType = 'multi-select' | 'single-select' | 'number'

interface FilterDef {
  id: keyof FilterState
  label: string
  type: FilterType
  staticOptions?: string[]    // hardcoded string options
  dynamicKey?: keyof ReturnType<typeof useFilterOptions>  // from API
  tabs: FiltersTab[]
}

const FILTER_CATALOG: FilterDef[] = [
  {
    id: 'planStatus',
    label: 'Plan status',
    type: 'multi-select',
    staticOptions: ['Active', 'In Progress', 'Completed', 'Draft', 'Archived'],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'plans',
    label: 'Plan(s)',
    type: 'multi-select',
    dynamicKey: 'plans',
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'owners',
    label: 'Owner(s)',
    type: 'multi-select',
    dynamicKey: 'users',
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'contributors',
    label: 'Contributor(s)',
    type: 'multi-select',
    dynamicKey: 'users',
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'teams',
    label: 'Team(s)',
    type: 'multi-select',
    dynamicKey: 'departments',
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'tags',
    label: 'Tags',
    type: 'multi-select',
    staticOptions: [],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    type: 'single-select',
    dynamicKey: 'timeframes',
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'confidence',
    label: 'Confidence',
    type: 'multi-select',
    staticOptions: ['On Track', 'At Risk', 'Off Track'],
    tabs: ['objectives', 'key-results'],
  },
  {
    id: 'insights',
    label: 'Insights',
    type: 'multi-select',
    staticOptions: [
      'Not measurable', 'With default targets', 'Pending check-ins',
      'Without owner', 'Not aligned', 'Reporting to you', 'Tagged as KPI',
    ],
    tabs: ['objectives', 'key-results'],
  },
  {
    id: 'progressAbove',
    label: 'Progress above',
    type: 'number',
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'progressBelow',
    label: 'Progress below',
    type: 'number',
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'outcomeType',
    label: 'Outcome type',
    type: 'multi-select',
    staticOptions: ['Committed', 'Aspirational'],
    tabs: ['objectives', 'key-results'],
  },
  {
    id: 'workStatus',
    label: 'Work status',
    type: 'multi-select',
    staticOptions: ['Backlog', 'Planned', 'Spec/Design', 'In Progress', 'In Review', 'Ready', 'Blocked', 'Done', 'Abandoned'],
    tabs: ['initiatives'],
  },
  {
    id: 'closedDate',
    label: 'Closed date',
    type: 'single-select',
    staticOptions: ['This week', 'This month', 'This quarter', 'Last quarter'],
    tabs: ['initiatives'],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDisplayValue(
  def: FilterDef,
  filters: FilterState,
  options: FilterOptions
): string | null {
  const raw = filters[def.id]
  if (raw === undefined || raw === null) return null

  if (def.type === 'number') return raw !== undefined ? `${raw}%` : null
  if (def.type === 'single-select') {
    // for dynamic keys, resolve label from options
    if (def.dynamicKey && typeof raw === 'string') {
      const found = options[def.dynamicKey]?.find((o) => o.id === raw || o.label === raw)
      return found?.label ?? String(raw)
    }
    return String(raw) || null
  }
  // multi-select
  if (!Array.isArray(raw) || raw.length === 0) return null
  if (raw.length === 1) {
    if (def.dynamicKey) {
      const found = options[def.dynamicKey]?.find((o) => o.id === raw[0] || o.label === raw[0])
      return found?.label ?? String(raw[0])
    }
    return String(raw[0])
  }
  return `${raw.length} selected`
}

type FilterOptions = { [K in keyof ReturnType<typeof useFilterOptions>]: OptionItem[] }

// ─── Add filter menu ─────────────────────────────────────────────────────────

function AddFilterMenu({ available, onAdd }: { available: FilterDef[]; onAdd: (id: keyof FilterState) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted',
          open && 'bg-muted'
        )}
      >
        <Plus className="size-3.5" />
        Filter +
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-border bg-popover py-1 shadow-lg">
            {available.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">All filters added</p>
            ) : (
              available.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => { onAdd(def.id); setOpen(false) }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  {def.label}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Single active filter field ───────────────────────────────────────────────

function ActiveFilterField({
  def,
  filters,
  options,
  onValueChange,
  onRemove,
}: {
  def: FilterDef
  filters: FilterState
  options: FilterOptions
  onValueChange: (id: keyof FilterState, value: any) => void
  onRemove: (id: keyof FilterState) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const displayValue = getDisplayValue(def, filters, options)
  const rawValue = filters[def.id]
  const selectedArr: string[] = Array.isArray(rawValue) ? (rawValue as string[]) : []

  // Build the options list for this field
  const fieldOptions: OptionItem[] = def.dynamicKey
    ? (options[def.dynamicKey] ?? [])
    : (def.staticOptions ?? []).map((s) => ({ id: s, label: s }))

  const filtered = search
    ? fieldOptions.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : fieldOptions

  function isSelected(opt: OptionItem): boolean {
    if (def.type === 'single-select') return rawValue === opt.id || rawValue === opt.label
    return selectedArr.includes(opt.id) || selectedArr.includes(opt.label)
  }

  function toggleOption(opt: OptionItem) {
    if (def.type === 'single-select') {
      onValueChange(def.id, isSelected(opt) ? undefined : opt.label)
      setOpen(false)
      return
    }
    // For dynamic options use id, for static use label
    const key = def.dynamicKey ? opt.id : opt.label
    const currentKeys = selectedArr
    const next = currentKeys.includes(key)
      ? currentKeys.filter((v) => v !== key)
      : [...currentKeys, key]
    onValueChange(def.id, next.length ? next : undefined)
  }

  return (
    <div className="relative shrink-0">
      <div className={cn(
        'flex h-9 items-center rounded-md border bg-background',
        open ? 'border-primary ring-1 ring-primary/20' : 'border-border'
      )}>
        {/* Selector trigger */}
        <button
          type="button"
          onClick={() => { setOpen((p) => !p); setSearch('') }}
          className="flex h-full items-center gap-1.5 pl-2.5 pr-1.5 text-sm"
        >
          <div className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {def.label}
            </span>
            <span className={cn('text-sm', displayValue ? 'text-foreground font-medium' : 'text-muted-foreground')}>
              {displayValue ?? 'Select…'}
            </span>
          </div>
          {displayValue && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onValueChange(def.id, undefined) }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
          <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {/* Divider + remove button */}
        <div className="flex h-full items-center border-l border-border px-1.5">
          <button
            type="button"
            onClick={() => onRemove(def.id)}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${def.label} filter`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Dropdown panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-border bg-popover shadow-lg">
            {def.type === 'number' ? (
              <div className="px-3 py-2.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Enter % (0–100)"
                  defaultValue={rawValue as number | undefined}
                  className="w-full rounded border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  onChange={(e) => onValueChange(def.id, e.target.value ? Number(e.target.value) : undefined)}
                  autoFocus
                />
              </div>
            ) : (
              <>
                {fieldOptions.length > 6 && (
                  <div className="border-b border-border px-2 py-1.5">
                    <input
                      type="text"
                      placeholder="Search…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                <div className="max-h-52 overflow-y-auto py-1">
                  {filtered.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">No options found</p>
                  ) : (
                    filtered.map((opt) => {
                      const active = isSelected(opt)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleOption(opt)}
                          className={cn(
                            'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                            active
                              ? 'bg-primary/10 text-primary font-semibold hover:bg-primary/15'
                              : 'text-foreground hover:bg-muted'
                          )}
                        >
                          {def.type !== 'single-select' && (
                            <span className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded border-2',
                              active
                                ? 'border-primary bg-primary'
                                : 'border-muted-foreground/40 bg-background'
                            )}>
                              {active && (
                                <svg viewBox="0 0 10 8" className="size-3">
                                  <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                          )}
                          <span className="truncate">{opt.label}</span>
                        </button>
                      )
                    })
                  )}
                </div>
                {def.type !== 'single-select' && selectedArr.length > 0 && (
                  <div className="border-t border-border px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onValueChange(def.id, undefined)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FilterBarProps {
  tab: FiltersTab
  filters: FilterState
  activeFilterIds: (keyof FilterState)[]
  onActiveFilterIdsChange: (ids: (keyof FilterState)[]) => void
  onFilterChange: (patch: Partial<FilterState>) => void
  onReset: () => void
}

export function FilterBar({
  tab,
  filters,
  activeFilterIds,
  onActiveFilterIdsChange,
  onFilterChange,
  onReset,
}: FilterBarProps) {
  const rawOptions = useFilterOptions()
  const options: FilterOptions = rawOptions

  const tabCatalog = FILTER_CATALOG.filter((d) => d.tabs.includes(tab))
  const available = tabCatalog.filter((d) => !activeFilterIds.includes(d.id))
  const active = activeFilterIds
    .map((id) => tabCatalog.find((d) => d.id === id))
    .filter(Boolean) as FilterDef[]

  const hasAnyValue = active.some((def) => getDisplayValue(def, filters, options) !== null)

  function addFilter(id: keyof FilterState) {
    onActiveFilterIdsChange([...activeFilterIds, id])
  }

  function removeFilter(id: keyof FilterState) {
    onActiveFilterIdsChange(activeFilterIds.filter((i) => i !== id))
    onFilterChange({ [id]: undefined })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
      <AddFilterMenu available={available} onAdd={addFilter} />

      {active.map((def) => (
        <ActiveFilterField
          key={def.id}
          def={def}
          filters={filters}
          options={options}
          onValueChange={(id, value) => onFilterChange({ [id]: value })}
          onRemove={removeFilter}
        />
      ))}

      {hasAnyValue && (
        <button
          type="button"
          onClick={onReset}
          className="ml-1 shrink-0 text-sm text-primary underline-offset-2 hover:underline"
        >
          Reset filters
        </button>
      )}
    </div>
  )
}
