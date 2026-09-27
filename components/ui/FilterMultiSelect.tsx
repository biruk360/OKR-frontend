'use client'

/**
 * FilterMultiSelect — the multi-select sibling of `FilterSelect`: a labelled
 * trigger that summarises the selection, a dropdown with a checkbox row per
 * option, an inline search above long lists and a Clear action.
 *
 * ⚠ Built on the Radix DropdownMenu wrappers in `components/ui/dropdown-menu`
 * (`DropdownMenuCheckboxItem` → `role="menuitemcheckbox"`), which gives
 * arrow-key roving, type-ahead, focus return and Escape for free. Do not
 * re-hand-roll this as a div popover — see the note at the top of FilterSelect.
 *
 * Rows use `onSelect={e => e.preventDefault()}` so the menu stays open while
 * several options are toggled.
 *
 * Zero business logic: callers pass options and receive the new value list.
 */

import * as React from 'react'
import { ChevronDown, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Eyebrow } from './Eyebrow'

export interface FilterMultiSelectOption {
  value: string
  label: string
  /** Optional right-aligned hint (a count, a department, a timeframe). */
  hint?: string
  /** Optional leading visual — an avatar, an icon, a swatch. */
  leading?: React.ReactNode
  disabled?: boolean
}

export interface FilterMultiSelectTriggerState {
  /** Summary text: placeholder, the single label, or the multi summary. */
  text: string
  /** Number of selected options that exist in `options`. */
  count: number
  open: boolean
}

export interface FilterMultiSelectProps {
  /** Field name — the trigger's eyebrow and its accessible name. */
  label: string
  /** Selected option values. `[]` means "no filter applied". */
  values: string[]
  onValuesChange: (values: string[]) => void
  options: FilterMultiSelectOption[]
  /** Trigger text when nothing is selected. */
  placeholder?: string
  /** Trigger text when two or more are selected. Default `"N selected"`. */
  summary?: (selected: FilterMultiSelectOption[]) => string
  /** Overrides the trigger's `aria-label` (defaults to `label`). */
  ariaLabel?: string
  /** Render the search box once the list is longer than this. Default 6. */
  searchThreshold?: number
  /** Dropdown panel width in px. Default 260. */
  menuWidth?: number
  /** Which edge of the trigger the panel lines up with. Default `start`. */
  align?: 'start' | 'center' | 'end'
  /** Replaces the default trigger contents (eyebrow + summary + chevron). */
  renderTrigger?: (state: FilterMultiSelectTriggerState) => React.ReactNode
  /** Merged over the default trigger classes (tailwind-merge resolves conflicts). */
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
  disabled?: boolean
  className?: string
  /** Copy when the search matches nothing. */
  emptyLabel?: string
  /** Copy for the Clear row. */
  clearLabel?: string
}

export function FilterMultiSelect({
  label,
  values,
  onValuesChange,
  options,
  placeholder = 'All',
  summary,
  ariaLabel,
  searchThreshold = 6,
  menuWidth = 260,
  align = 'start',
  renderTrigger,
  triggerClassName,
  triggerStyle,
  disabled = false,
  className,
  emptyLabel = 'No options found',
  clearLabel = 'Clear',
}: FilterMultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const searchRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const showSearch = options.length > searchThreshold
  const selectedSet = React.useMemo(() => new Set(values), [values])
  const selected = React.useMemo(
    () => options.filter((o) => selectedSet.has(o.value)),
    [options, selectedSet],
  )

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search])

  // Radix focuses the menu content on open; move focus into the search box so
  // the user can type straight away.
  React.useEffect(() => {
    if (!open) {
      setSearch('')
      return
    }
    if (!showSearch) return
    // Not on touch: focusing the input raises the on-screen keyboard over the
    // very list the user opened the menu to tap.
    if (window.matchMedia?.('(pointer: coarse)').matches) return
    const id = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open, showSearch])

  const count = selected.length
  const text =
    count === 0 ? placeholder
      : count === 1 ? selected[0].label
      : summary ? summary(selected)
      : `${count} selected`

  const toggle = (value: string) => {
    onValuesChange(
      selectedSet.has(value) ? values.filter((v) => v !== value) : [...values, value],
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--ap-radius-sm)] border bg-[var(--ap-bg-raised)] pl-2.5 pr-2 text-left',
          'border-[var(--ap-border-strong)] shadow-[shadow:var(--ap-shadow-sm)] outline-none',
          // A ring, not a border colour, so the focus state survives callers
          // that set the border inline via `triggerStyle`.
          'ap-focus-ring data-[state=open]:border-[var(--ap-focus)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
          triggerClassName,
        )}
        style={triggerStyle}
      >
        {renderTrigger ? (
          renderTrigger({ text, count, open })
        ) : (
          <>
            <span className="flex min-w-0 flex-col items-start gap-px leading-none">
              <Eyebrow size="sm" className="font-bold text-[var(--ap-fg-subtle)]" as="span">
                {label}
              </Eyebrow>
              <span
                className="max-w-[180px] truncate text-[13px] font-medium"
                style={{ color: count > 0 ? 'var(--ap-fg)' : 'var(--ap-fg-subtle)' }}
              >
                {text}
              </span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="rounded-[var(--ap-radius-md)] p-0 shadow-[shadow:var(--ap-shadow-pop-lg)]"
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
                onKeyDown={(e) => {
                  // ArrowDown hands focus to the first row so the keyboard can
                  // reach the list without the mouse.
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    listRef.current
                      ?.querySelector<HTMLElement>('[role="menuitemcheckbox"]:not([data-disabled])')
                      ?.focus()
                    return
                  }
                  // Escape bubbles so the menu still closes.
                  if (e.key === 'Escape') return
                  // Radix Menu runs type-ahead (and swallows Tab) off keydown on
                  // the content element. Without this the search box's own
                  // keystrokes would also move focus between rows.
                  e.stopPropagation()
                }}
                className="w-full rounded-[var(--ap-radius-xs)] bg-transparent py-1.5 pl-7 pr-2 text-xs outline-none focus:border-[var(--ap-focus)]"
                style={{ border: '1px solid var(--ap-border-strong)', color: 'var(--ap-fg)' }}
              />
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
            {emptyLabel}
          </p>
        ) : (
          <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1">
            {filtered.map((opt) => (
              <DropdownMenuCheckboxItem
                key={opt.value}
                checked={selectedSet.has(opt.value)}
                disabled={opt.disabled}
                onCheckedChange={() => toggle(opt.value)}
                // Keep the menu open while toggling several rows (AFL-3).
                onSelect={(e) => e.preventDefault()}
                className={cn(
                  'gap-2 rounded-[var(--ap-radius-sm)] py-1.5 pl-2 text-[13px]',
                  // Token hover/focus instead of the shadcn `accent` colours.
                  'focus:bg-[var(--ap-bg-hover)] focus:text-[var(--ap-fg)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  'data-[state=checked]:font-semibold data-[state=checked]:text-[var(--ap-accent-on-soft)] data-[state=checked]:focus:text-[var(--ap-accent-on-soft)]',
                )}
              >
                {opt.leading && <span className="flex shrink-0 items-center">{opt.leading}</span>}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {opt.hint && (
                  <span
                    className="ml-auto shrink-0 font-normal tabular-nums text-caption"
                    style={{ color: 'var(--ap-fg-subtle)' }}
                  >
                    {opt.hint}
                  </span>
                )}
              </DropdownMenuCheckboxItem>
            ))}
          </div>
        )}

        {count > 0 && (
          <>
            <DropdownMenuSeparator className="mx-0 my-0" />
            <div className="p-1">
              <DropdownMenuItem
                onSelect={() => onValuesChange([])}
                className="rounded-[var(--ap-radius-sm)] py-1.5 pl-2 text-[13px] font-semibold text-[var(--ap-accent)] focus:bg-[var(--ap-bg-hover)] focus:text-[var(--ap-accent)]"
              >
                {clearLabel}
              </DropdownMenuItem>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default FilterMultiSelect
