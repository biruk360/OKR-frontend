'use client'

import { useState } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
// Shared DropdownMenu (Radix): outside-click, Esc, focus return and arrow-key
// navigation — replaces the hand-rolled fixed-inset click-catcher.

function AddFilterMenu({ available, onAdd }: { available: FilterDef[]; onAdd: (id: keyof FilterState) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-opacity hover:opacity-75"
          style={{ borderColor: 'var(--ap-accent)', color: 'var(--ap-accent)', background: 'var(--ap-accent-soft)' }}
        >
          <Plus className="size-3.5" aria-hidden />
          Filter +
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[200px]">
        {available.length === 0 ? (
          <DropdownMenuItem disabled className="text-xs">All filters added</DropdownMenuItem>
        ) : (
          available.map((def) => (
            <DropdownMenuItem key={def.id} className="text-body-sm" onSelect={() => onAdd(def.id)}>
              {def.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Single active filter field ───────────────────────────────────────────────
// Popover (Radix) anchored to the whole field. The clear (×) button used to be
// nested inside the trigger <button> (invalid HTML); it is now a sibling.

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
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setSearch('') }}>
      <PopoverAnchor asChild>
        <div
          className="flex h-9 shrink-0 items-center rounded-lg transition-all duration-150"
          style={{
            background: 'var(--ap-bg-raised)',
            border: open ? '1.5px solid var(--ap-accent)' : '1px solid var(--ap-border-strong)',
            boxShadow: open ? '0 0 0 3px color-mix(in oklch, var(--ap-accent) 12%, transparent)' : 'var(--ap-shadow-sm)',
          }}
        >
          {/* Selector trigger */}
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-full items-center gap-1.5 pl-2.5 pr-1"
              aria-label={`${def.label}: ${displayValue ?? 'not set'}`}
            >
              <span className="flex flex-col items-start leading-none gap-px">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
                  {def.label}
                </span>
                <span className="text-body-sm font-medium" style={{ color: displayValue ? 'var(--ap-fg)' : 'var(--ap-fg-subtle)' }}>
                  {displayValue ?? 'Select…'}
                </span>
              </span>
              {!displayValue && (
                <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden />
              )}
            </button>
          </PopoverTrigger>
          {displayValue && (
            <>
              <button
                type="button"
                onClick={() => onValueChange(def.id, undefined)}
                className="rounded-full p-0.5 transition-colors hover:bg-[var(--ap-bg-hover)]"
                style={{ color: 'var(--ap-fg-subtle)' }}
                aria-label={`Clear ${def.label}`}
              >
                <X className="size-3" aria-hidden />
              </button>
              <ChevronDown
                className={cn('mr-1 size-3.5 transition-transform', open && 'rotate-180')}
                style={{ color: 'var(--ap-fg-subtle)' }}
                aria-hidden
              />
            </>
          )}

          {/* Divider + remove */}
          <div className="flex h-full items-center px-1.5" style={{ borderLeft: '1px solid var(--ap-border)' }}>
            <button
              type="button"
              onClick={() => onRemove(def.id)}
              className="rounded p-0.5 transition-colors hover:bg-[var(--ap-bg-hover)]"
              style={{ color: 'var(--ap-fg-subtle)' }}
              aria-label={`Remove ${def.label} filter`}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </PopoverAnchor>

      {/* Dropdown panel */}
      <PopoverContent label={`${def.label} filter`} width={240} variant="menu" className="!p-0" sideOffset={6}>
        {def.type === 'number' ? (
          <div className="px-3 py-2.5">
            <input
              type="number"
              min={0}
              max={100}
              placeholder="Enter % (0–100)"
              aria-label={`${def.label} (%)`}
              defaultValue={rawValue as number | undefined}
              className="w-full rounded-lg bg-transparent px-2 py-1.5 text-sm focus:outline-none"
              style={{ border: '1px solid var(--ap-border-strong)', color: 'var(--ap-fg)' }}
              onChange={(e) => onValueChange(def.id, e.target.value ? Number(e.target.value) : undefined)}
              autoFocus
            />
          </div>
        ) : (
          <>
            {fieldOptions.length > 6 && (
              <div className="px-2 py-2" style={{ borderBottom: '1px solid var(--ap-border)' }}>
                <input
                  type="text"
                  placeholder="Search…"
                  aria-label={`Search ${def.label} options`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg bg-transparent px-2.5 py-1.5 text-xs focus:outline-none"
                  style={{ border: '1px solid var(--ap-border-strong)', color: 'var(--ap-fg)' }}
                  autoFocus
                />
              </div>
            )}
            <div className="max-h-52 overflow-y-auto py-1" role="group" aria-label={def.label}>
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No options found</p>
              ) : (
                filtered.map((opt) => {
                  const active = isSelected(opt)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
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
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40 bg-background'
                        )}>
                          {active && (
                            <svg viewBox="0 0 10 8" className="size-3" aria-hidden>
                              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
      </PopoverContent>
    </Popover>
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
    <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
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
