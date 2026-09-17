'use client'

/**
 * FilterSelect — the standard filter control: a labelled trigger that shows the
 * active value, an optional inline search above long option lists, a clear
 * affordance and an optional remove affordance.
 *
 * ⚠ This is a **thin styled wrapper over `components/ui/select.tsx`** (Radix),
 * deliberately. The app has ~25 native `<select>` filters; replacing a native
 * select with a hand-rolled div popover is an accessibility downgrade unless it
 * reimplements listbox roles, type-ahead and arrow-key roving. Radix already
 * has all three. Do not re-hand-roll this.
 * See docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4.
 *
 * Shape copied from `features/filters/components/FilterBar.tsx:305-372`, which
 * was already a near-complete generic implementation.
 *
 * Scope: **single-select only.** Radix Select has no multi-select mode, and the
 * accessible pattern for multi-select is a checkbox group, not a listbox. The
 * multi-select filters in FilterBar keep their own control for now.
 */

import * as React from 'react'
import { Search, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Eyebrow } from './Eyebrow'

export interface FilterSelectOption {
  value: string
  label: string
  /** Optional right-aligned hint (a count, a department, a timeframe). */
  hint?: string
  disabled?: boolean
}

export interface FilterSelectProps {
  /** Field name, rendered as the eyebrow inside the trigger. */
  label: string
  /** Active option value. `undefined` means "no filter applied". */
  value?: string
  onValueChange: (value: string | undefined) => void
  options: FilterSelectOption[]
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string
  /** Show the inline × that resets the field. On by default. */
  clearable?: boolean
  /** When supplied, renders the trailing "remove this filter" affordance. */
  onRemove?: () => void
  /** Render the search box once the list is longer than this. Default 6. */
  searchThreshold?: number
  /** Fixed trigger width in px. Defaults to intrinsic sizing. */
  width?: number
  /** Dropdown panel width in px. Default 190 — the design's filter select. */
  menuWidth?: number
  disabled?: boolean
  className?: string
  /** Empty-list copy. */
  emptyLabel?: string
}

export function FilterSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  clearable = true,
  onRemove,
  searchThreshold = 6,
  width,
  menuWidth = 190,
  disabled = false,
  className,
  emptyLabel = 'No options found',
}: FilterSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const searchRef = React.useRef<HTMLInputElement>(null)

  const showSearch = options.length > searchThreshold

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search])

  // The selected option can be filtered out of the list while searching. Radix
  // reads the trigger's text from the mounted item, so keep it mounted.
  const selected = options.find((o) => o.value === value)
  const items = React.useMemo(() => {
    if (!selected || filtered.some((o) => o.value === selected.value)) return filtered
    return [selected, ...filtered]
  }, [filtered, selected])

  React.useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const hasValue = value !== undefined && value !== ''
  const showClear = hasValue && clearable

  return (
    <div className={cn('relative inline-flex shrink-0', className)} style={width ? { width } : undefined}>
      <Select
        open={open}
        onOpenChange={setOpen}
        value={value ?? ''}
        onValueChange={(v) => onValueChange(v || undefined)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={label}
          className={cn(
            'h-9 w-full items-center gap-1.5 rounded-[var(--ap-radius-sm)] bg-[var(--ap-bg-raised)] py-0 pl-2.5 text-left',
            'border-[var(--ap-border-strong)] shadow-[var(--ap-shadow-sm)]',
            'data-[state=open]:border-[var(--ap-focus)]',
            // Room for the clear / remove affordances, which are siblings —
            // nesting a <button> inside the trigger button is invalid HTML.
            // The padding has to clear them so the chevron never sits under one.
            showClear && onRemove ? 'pr-[46px]'
              : showClear ? 'pr-7'
              : onRemove ? 'pr-[30px]'
              : 'pr-2',
          )}
        >
          <span className="flex min-w-0 flex-col items-start gap-px leading-none">
            <Eyebrow size="sm" className="font-bold text-[var(--ap-fg-subtle)]" as="span">
              {label}
            </Eyebrow>
            <span
              className="truncate text-[13px] font-medium"
              style={{ color: hasValue ? 'var(--ap-fg)' : 'var(--ap-fg-subtle)' }}
            >
              <SelectValue placeholder={placeholder} />
            </span>
          </span>
        </SelectTrigger>

        <SelectContent
          position="popper"
          align="start"
          sideOffset={6}
          className="rounded-[var(--ap-radius-md)] shadow-[var(--ap-shadow-pop-lg)]"
          style={{ width: menuWidth, minWidth: menuWidth }}
          onCloseAutoFocus={() => setSearch('')}
        >
          {showSearch && (
            <div
              className="sticky top-0 z-10 bg-popover p-1.5"
              style={{ borderBottom: '1px solid var(--ap-border)' }}
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2"
                  style={{ color: 'var(--ap-fg-subtle)' }}
                  aria-hidden="true"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  placeholder="Search…"
                  aria-label={`Search ${label} options`}
                  onChange={(e) => setSearch(e.target.value)}
                  // Radix Select runs type-ahead off keydown on the content
                  // element. Without this the search box's own keystrokes also
                  // move the listbox selection.
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full rounded-[var(--ap-radius-xs)] py-1.5 pl-7 pr-2 text-xs outline-none focus:border-[var(--ap-focus)]"
                  style={{ border: '1px solid var(--ap-border-strong)', color: 'var(--ap-fg)' }}
                />
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
              {emptyLabel}
            </p>
          ) : (
            <div className="p-1">
              {items.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className="rounded-[var(--ap-radius-sm)] py-1.5 pl-2 text-[13px] data-[state=checked]:font-semibold data-[state=checked]:text-[var(--ap-accent-on-soft)]"
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="ml-auto text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                      {opt.hint}
                    </span>
                  )}
                </SelectItem>
              ))}
            </div>
          )}
        </SelectContent>
      </Select>

      {showClear && (
        <button
          type="button"
          onClick={() => onValueChange(undefined)}
          aria-label={`Clear ${label}`}
          className={cn(
            'absolute top-1/2 z-10 -translate-y-1/2 rounded-full p-0.5 transition-colors hover:bg-[var(--ap-bg-hover)]',
            onRemove ? 'right-[26px]' : 'right-1.5',
          )}
          style={{ color: 'var(--ap-fg-subtle)' }}
        >
          <X className="size-3" />
        </button>
      )}

      {onRemove && (
        <div
          className="absolute right-0 top-1/2 z-10 flex h-5 -translate-y-1/2 items-center px-1.5"
          style={{ borderLeft: '1px solid var(--ap-border)' }}
        >
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label} filter`}
            className="rounded-[var(--ap-radius-xs)] p-0.5 transition-colors hover:bg-[var(--ap-bg-hover)]"
            style={{ color: 'var(--ap-fg-subtle)' }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export default FilterSelect
