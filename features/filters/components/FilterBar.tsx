'use client'

import { useRef, useState } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilterState, FiltersTab } from '../types'

// ─── Filter catalog ──────────────────────────────────────────────────────────

type FilterType = 'multi-select' | 'single-select' | 'number'

interface FilterDef {
  id: keyof FilterState
  label: string
  type: FilterType
  options?: string[]
  tabs: FiltersTab[]
}

const FILTER_CATALOG: FilterDef[] = [
  {
    id: 'planStatus',
    label: 'Plan status',
    type: 'multi-select',
    options: ['Active', 'In Progress', 'Completed', 'Draft', 'Archived'],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'plans',
    label: 'Plan(s)',
    type: 'multi-select',
    options: [],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'owners',
    label: 'Owner(s)',
    type: 'multi-select',
    options: [],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'contributors',
    label: 'Contributor(s)',
    type: 'multi-select',
    options: [],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'teams',
    label: 'Team(s)',
    type: 'multi-select',
    options: [],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'path',
    label: 'Path',
    type: 'multi-select',
    options: [],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'tags',
    label: 'Tags',
    type: 'multi-select',
    options: [],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    type: 'single-select',
    options: ['This week', 'This month', 'This quarter', 'Last quarter', 'Custom…'],
    tabs: ['objectives', 'key-results', 'initiatives'],
  },
  {
    id: 'confidence',
    label: 'Confidence',
    type: 'multi-select',
    options: ['On Track', 'At Risk', 'Off Track'],
    tabs: ['objectives', 'key-results'],
  },
  {
    id: 'insights',
    label: 'Insights',
    type: 'multi-select',
    options: [
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
    options: ['Committed', 'Aspirational'],
    tabs: ['objectives', 'key-results'],
  },
  {
    id: 'workStatus',
    label: 'Work status',
    type: 'multi-select',
    options: ['Backlog', 'Planned', 'Spec/Design', 'In Progress', 'In Review', 'Ready', 'Blocked', 'Done', 'Abandoned'],
    tabs: ['initiatives'],
  },
  {
    id: 'label',
    label: 'Label',
    type: 'multi-select',
    options: [],
    tabs: ['initiatives'],
  },
  {
    id: 'closedDate',
    label: 'Closed date',
    type: 'single-select',
    options: ['This week', 'This month', 'This quarter', 'Last quarter'],
    tabs: ['initiatives'],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDisplayValue(def: FilterDef, filters: FilterState): string | null {
  const raw = filters[def.id]
  if (raw === undefined || raw === null) return null
  if (def.type === 'number') return raw !== undefined ? String(raw) : null
  if (def.type === 'single-select') return (raw as string) || null
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.length === 1 ? String(raw[0]) : `${raw.length} selected`
  }
  return null
}

function clearFilter(id: keyof FilterState): Partial<FilterState> {
  return { [id]: undefined }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** The "Filter +" button with a dropdown listing available filter types */
function AddFilterMenu({
  available,
  onAdd,
}: {
  available: FilterDef[]
  onAdd: (id: keyof FilterState) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5',
          open && 'bg-primary/5'
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
                  className="flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
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

/** An individual active filter field showing label + value selector + remove */
function ActiveFilterField({
  def,
  filters,
  onValueChange,
  onRemove,
}: {
  def: FilterDef
  filters: FilterState
  onValueChange: (id: keyof FilterState, value: any) => void
  onRemove: (id: keyof FilterState) => void
}) {
  const [open, setOpen] = useState(false)
  const displayValue = getDisplayValue(def, filters)

  const rawValue = filters[def.id]
  const selectedArr: string[] = Array.isArray(rawValue) ? (rawValue as string[]) : []

  function toggleOption(opt: string) {
    if (def.type === 'single-select') {
      onValueChange(def.id, opt === rawValue ? undefined : opt)
      setOpen(false)
      return
    }
    const next = selectedArr.includes(opt)
      ? selectedArr.filter((v) => v !== opt)
      : [...selectedArr, opt]
    onValueChange(def.id, next.length ? next : undefined)
  }

  return (
    <div className="flex shrink-0 items-stretch rounded-md border border-border bg-background">
      {/* Value selector button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex h-full flex-col justify-center px-2.5 py-1 text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {def.label}
          </span>
          <div className="flex items-center gap-1">
            <span className={cn('text-sm', displayValue ? 'text-foreground' : 'text-muted-foreground')}>
              {displayValue ?? 'Select…'}
            </span>
            {displayValue && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onValueChange(def.id, undefined) }}
                className="rounded text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
            <ChevronDown className="size-3 text-muted-foreground" />
          </div>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-border bg-popover py-1 shadow-lg">
              {def.type === 'number' ? (
                <div className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0–100"
                    defaultValue={rawValue as number | undefined}
                    className="w-full rounded border border-border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onValueChange(def.id, Number((e.target as HTMLInputElement).value) || undefined)
                        setOpen(false)
                      }
                    }}
                    onChange={(e) => onValueChange(def.id, Number(e.target.value) || undefined)}
                    autoFocus
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">Press Enter to apply</p>
                </div>
              ) : (def.options ?? []).length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No options available</p>
              ) : (
                (def.options ?? []).map((opt) => {
                  const active = def.type === 'single-select'
                    ? rawValue === opt
                    : selectedArr.includes(opt)
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleOption(opt)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                        active && 'text-primary-600 font-medium'
                      )}
                    >
                      {def.type !== 'single-select' && (
                        <span className={cn(
                          'flex size-3.5 shrink-0 items-center justify-center rounded border',
                          active ? 'border-primary bg-primary' : 'border-muted-foreground'
                        )}>
                          {active && (
                            <svg viewBox="0 0 10 8" className="size-2.5">
                              <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      )}
                      {opt}
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Divider + remove button */}
      <div className="flex items-center border-l border-border px-1.5">
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
  const tabCatalog = FILTER_CATALOG.filter((d) => d.tabs.includes(tab))
  const available = tabCatalog.filter((d) => !activeFilterIds.includes(d.id))
  const active = activeFilterIds
    .map((id) => tabCatalog.find((d) => d.id === id))
    .filter(Boolean) as FilterDef[]

  const hasAnyValue = active.some((def) => getDisplayValue(def, filters) !== null)

  function addFilter(id: keyof FilterState) {
    onActiveFilterIdsChange([...activeFilterIds, id])
  }

  function removeFilter(id: keyof FilterState) {
    onActiveFilterIdsChange(activeFilterIds.filter((i) => i !== id))
    onFilterChange(clearFilter(id))
  }

  function handleValueChange(id: keyof FilterState, value: any) {
    onFilterChange({ [id]: value })
  }

  function handleReset() {
    onReset()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
      <AddFilterMenu available={available} onAdd={addFilter} />

      {active.map((def) => (
        <ActiveFilterField
          key={def.id}
          def={def}
          filters={filters}
          onValueChange={handleValueChange}
          onRemove={removeFilter}
        />
      ))}

      {hasAnyValue && (
        <button
          type="button"
          onClick={handleReset}
          className="ml-1 shrink-0 text-sm text-primary underline-offset-2 hover:underline"
        >
          Reset filters
        </button>
      )}
    </div>
  )
}
