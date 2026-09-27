'use client'

/** OKR Explorer — filter strip: search, Timeframe / Department / Level / Status pills, hide finished, view toggle. */

import { useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ViewMode } from './okrs-all-utils'

/* --------------------------- Filter widgets --------------------------- */

function MultiPill<T extends { id: string; label?: string; name?: string }>({
  label, options, selected, onChange,
}: {
  label: string
  options: T[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const active = selected.length > 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[var(--ap-radius-sm)] px-2.5 h-8 text-xs font-medium border transition-colors',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
          style={{
            borderColor: active ? 'var(--ap-accent)' : 'var(--ap-border)',
            background: active ? 'var(--ap-accent-soft)' : 'var(--ap-bg)',
          }}
        >
          {label}
          {active && (
            <span className="inline-flex items-center justify-center rounded-full px-1.5 text-micro font-bold tabular-nums"
              style={{ background: 'var(--ap-accent)', color: 'var(--ap-accent-fg)', minWidth: 16 }}>
              {selected.length}
            </span>
          )}
          <ChevronDown className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent label={label} width={256} variant="menu" align="start" sideOffset={4}>
        <div className="px-3 py-2 border-b text-caption font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ borderColor: 'var(--ap-border)' }}>
          {label}
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {options.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No options</li>}
          {options.map(o => {
            const checked = selected.includes(o.id)
            return (
              <li key={o.id}>
                <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer rounded-[var(--ap-radius-xs)] hover:bg-[var(--ap-bg-sunken)]">
                  <input type="checkbox" checked={checked}
                    onChange={() => onChange(checked ? selected.filter(x => x !== o.id) : [...selected, o.id])}
                    className="h-3.5 w-3.5" />
                  <span className="text-body-sm truncate">{o.label ?? o.name}</span>
                </label>
              </li>
            )
          })}
        </ul>
        {selected.length > 0 && (
          <div className="border-t px-3 py-2 text-right" style={{ borderColor: 'var(--ap-border)' }}>
            <button type="button" className="text-caption text-[var(--ap-accent)] hover:underline" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export interface PillConfig {
  label: string
  options: { id: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}

export function OkrsAllFilterStrip({
  q, onQueryChange, pills, hideFinished, onHideFinishedChange, view, onViewChange, activeFilterCount, onClearFilters,
}: {
  q: string
  onQueryChange: (q: string) => void
  pills: PillConfig[]
  hideFinished: boolean
  onHideFinishedChange: (v: boolean) => void
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  activeFilterCount: number
  onClearFilters: () => void
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg-sunken)' }}
    >
      <div
        className="flex items-center gap-1.5 rounded-[var(--ap-radius-sm)] border px-2 h-8 w-72 bg-card"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search OKR title…"
          aria-label="Search OKR title"
          className="w-full text-body-sm focus:outline-none bg-transparent"
        />
        {q && (
          <button type="button" onClick={() => onQueryChange('')} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {pills.map((p, i) => (
        <MultiPill key={i} label={p.label} options={p.options} selected={p.selected} onChange={p.onChange} />
      ))}

      <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
        <input
          type="checkbox"
          checked={hideFinished}
          onChange={(e) => onHideFinishedChange(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Hide finished
      </label>

      <div className="ml-auto flex items-center gap-2">
        {/* View toggle */}
        <div
          className="inline-flex items-center rounded-[var(--ap-radius-sm)] p-0.5 text-caption font-medium"
          style={{ background: 'var(--ap-bg)' }}
        >
          <button
            type="button"
            onClick={() => onViewChange('compact')}
            aria-pressed={view === 'compact'}
            className={cn(
              'px-2.5 py-1 rounded-[8px] transition-colors',
              view === 'compact' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Compact rows
          </button>
          <button
            type="button"
            onClick={() => onViewChange('rich')}
            aria-pressed={view === 'rich'}
            className={cn(
              'px-2.5 py-1 rounded-[8px] transition-colors',
              view === 'rich' ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Rich cards
          </button>
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-[var(--ap-accent)] hover:underline"
          >
            Clear {activeFilterCount}
          </button>
        )}
      </div>
    </div>
  )
}
