'use client'

import { useState } from 'react'
import { Filter, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FilterState, FiltersTab } from '../types'

interface FilterBarProps {
  tab: FiltersTab
  filters: FilterState
  onFilterChange: (patch: Partial<FilterState>) => void
  onReset: () => void
}

const CONFIDENCE_OPTIONS = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK']
const CONFIDENCE_LABELS: Record<string, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  OFF_TRACK: 'Off Track',
}

const PLAN_STATUS_OPTIONS = ['In Progress', 'Active', 'Completed', 'Draft', 'Archived']

const WORK_STATUS_OPTIONS = [
  'Backlog', 'Planned', 'Spec/Design', 'In Progress', 'In Review', 'Ready', 'Blocked', 'Done', 'Abandoned',
]

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="flex items-center gap-1 text-xs font-medium">
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
      <button type="button" onClick={onRemove} className="ml-0.5 rounded hover:text-destructive">
        <X className="size-3" />
      </button>
    </Badge>
  )
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium transition-colors hover:bg-muted',
          selected.length > 0 && 'border-primary/50 bg-primary/5'
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {selected.length}
          </span>
        )}
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-border bg-popover py-1 shadow-lg">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                  selected.includes(opt) && 'text-primary-600'
                )}
              >
                <span
                  className={cn(
                    'flex size-3.5 items-center justify-center rounded border border-border',
                    selected.includes(opt) && 'border-primary bg-primary'
                  )}
                >
                  {selected.includes(opt) && (
                    <svg viewBox="0 0 10 8" className="size-2.5 fill-primary-foreground">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function FilterBar({ tab, filters, onFilterChange, onReset }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)

  const chips: { label: string; key: keyof FilterState; value: string }[] = []

  if (filters.planStatus?.length) {
    filters.planStatus.forEach((v) => chips.push({ label: 'Plan status', key: 'planStatus', value: v }))
  }
  if (filters.confidence?.length) {
    filters.confidence.forEach((v) =>
      chips.push({ label: 'Confidence', key: 'confidence', value: CONFIDENCE_LABELS[v] ?? v })
    )
  }
  if (filters.workStatus?.length) {
    filters.workStatus.forEach((v) => chips.push({ label: 'Work status', key: 'workStatus', value: v }))
  }
  if (filters.owners?.length) {
    chips.push({ label: 'Owner', key: 'owners', value: `${filters.owners.length} selected` })
  }

  const hasFilters = chips.length > 0

  function toggleMulti(key: 'planStatus' | 'confidence' | 'workStatus', val: string) {
    const current = (filters[key] ?? []) as string[]
    const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val]
    onFilterChange({ [key]: next.length ? next : undefined })
  }

  function removeChip(label: string, value: string) {
    if (label === 'Plan status') {
      onFilterChange({ planStatus: filters.planStatus?.filter((v) => v !== value) || [] })
    } else if (label === 'Confidence') {
      const raw = Object.entries(CONFIDENCE_LABELS).find(([, l]) => l === value)?.[0]
      onFilterChange({ confidence: filters.confidence?.filter((v) => v !== raw) || [] })
    } else if (label === 'Work status') {
      onFilterChange({ workStatus: filters.workStatus?.filter((v) => v !== value) || [] })
    } else if (label === 'Owner') {
      onFilterChange({ owners: [] })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() => setExpanded((p) => !p)}
      >
        <Filter className="size-3.5" />
        Filter
      </Button>

      {expanded && (
        <>
          <FilterDropdown
            label="Plan status"
            options={PLAN_STATUS_OPTIONS}
            selected={filters.planStatus ?? []}
            onToggle={(v) => toggleMulti('planStatus', v)}
          />
          <FilterDropdown
            label="Confidence"
            options={CONFIDENCE_OPTIONS}
            selected={filters.confidence ?? []}
            onToggle={(v) => toggleMulti('confidence', v)}
          />
          {tab === 'initiatives' && (
            <FilterDropdown
              label="Work status"
              options={WORK_STATUS_OPTIONS}
              selected={filters.workStatus ?? []}
              onToggle={(v) => toggleMulti('workStatus', v)}
            />
          )}
        </>
      )}

      {chips.map((chip) => (
        <FilterChip
          key={`${chip.label}-${chip.value}`}
          label={chip.label}
          value={chip.value}
          onRemove={() => removeChip(chip.label, chip.value)}
        />
      ))}

      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Reset filters
        </button>
      )}
    </div>
  )
}
