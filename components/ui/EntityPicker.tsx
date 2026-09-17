'use client'

/**
 * EntityPicker — the one OKR search-and-pick control.
 *
 * Promoted from `components/sprints/LinkToOkrPopover.tsx`, which was the most
 * complete of **11** independent implementations (it is the only one with
 * recents, cascading expand and both entity types). Generalised here:
 *
 *   - `selectable` — pick key results only (the original behaviour), objectives
 *     only, or either. Several of the 11 call sites need objectives.
 *   - `recentKey` — recents are namespaced, so the sprint linker and the parent
 *     objective selector do not share a list.
 *   - the fetch moved to `hooks/useOkrOptions`, which replaced two competing
 *     strategies for the same data with one request.
 *
 * `components/sprints/LinkToOkrPopover.tsx` is intentionally still in place —
 * other phases of the refresh migrate its call sites.
 * See docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, Target, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useOkrOptions, type OkrObjectiveOption } from '@/hooks/useOkrOptions'

const DEFAULT_RECENT_KEY = 'okr-entity-picker-recent-v1'
const MAX_RECENT = 5

export type EntityKind = 'objective' | 'keyResult'

export interface EntityPickerValue {
  /** Which entity the id refers to. */
  kind: EntityKind
  id: string
  title: string
  /** Parent objective. Set for both kinds; for an objective it is itself. */
  objectiveId: string
  objectiveTitle: string
}

export interface EntityPickerProps {
  value: EntityPickerValue | null
  onChange: (value: EntityPickerValue | null) => void
  /** Which rows are pickable. Default `keyResult` — the original behaviour. */
  selectable?: EntityKind | 'both'
  /** Preset list. When omitted the picker loads via `useOkrOptions` on open. */
  objectives?: OkrObjectiveOption[]
  /** Forwarded to `useOkrOptions` when no preset list is supplied. */
  query?: { status?: string; ownerId?: string; timeframeId?: string; level?: string; limit?: number }
  /** localStorage namespace for the "Recent" section. Pass a distinct key per
   *  surface so unrelated pickers do not share a history. */
  recentKey?: string
  /** Hide the "Recent" section entirely. */
  showRecents?: boolean
  /** Trigger copy when nothing is selected. */
  placeholder?: string
  /** Popover panel width in px. */
  width?: number
  /** Ids that cannot be picked (e.g. an objective cannot be its own parent). */
  disabledIds?: string[]
  disabled?: boolean
  className?: string
  emptyLabel?: string
}

function readRecent(key: string): EntityPickerValue[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function pushRecent(key: string, v: EntityPickerValue) {
  if (typeof window === 'undefined') return
  const cur = readRecent(key).filter((r) => !(r.id === v.id && r.kind === v.kind))
  cur.unshift(v)
  try {
    window.localStorage.setItem(key, JSON.stringify(cur.slice(0, MAX_RECENT)))
  } catch {
    /* quota or private mode — recents are a convenience, never load-bearing */
  }
}

export function EntityPicker({
  value,
  onChange,
  selectable = 'keyResult',
  objectives: presetObjectives,
  query,
  recentKey = DEFAULT_RECENT_KEY,
  showRecents = true,
  placeholder = 'Link to OKR…',
  width = 420,
  disabledIds,
  disabled = false,
  className,
  emptyLabel = 'No matches.',
}: EntityPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [recent, setRecent] = useState<EntityPickerValue[]>([])

  const canPickObjective = selectable === 'objective' || selectable === 'both'
  const canPickKeyResult = selectable === 'keyResult' || selectable === 'both'

  // Only fetch once the panel opens, and never when a preset list was supplied.
  const { objectives: fetched, isLoading } = useOkrOptions({
    ...query,
    requireKeyResults: selectable === 'keyResult',
    enabled: open && !presetObjectives,
  })

  const objectives = presetObjectives ?? fetched

  useEffect(() => {
    if (open && showRecents) setRecent(readRecent(recentKey))
  }, [open, showRecents, recentKey])

  const disabledSet = useMemo(() => new Set(disabledIds ?? []), [disabledIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return objectives
    return objectives
      .map((o) => {
        const objMatch = o.title.toLowerCase().includes(q)
        const krs = o.keyResults.filter((k) => k.title.toLowerCase().includes(q))
        if (objMatch || krs.length > 0) {
          return { ...o, keyResults: objMatch && krs.length === 0 ? o.keyResults : krs }
        }
        return null
      })
      .filter((x): x is OkrObjectiveOption => x !== null)
  }, [objectives, search])

  function commit(next: EntityPickerValue) {
    if (showRecents) pushRecent(recentKey, next)
    onChange(next)
    setOpen(false)
    setSearch('')
  }

  function pickObjective(o: { id: string; title: string }) {
    commit({ kind: 'objective', id: o.id, title: o.title, objectiveId: o.id, objectiveTitle: o.title })
  }

  function pickKeyResult(o: { id: string; title: string }, k: { id: string; title: string }) {
    commit({
      kind: 'keyResult',
      id: k.id,
      title: k.title,
      objectiveId: o.id,
      objectiveTitle: o.title,
    })
  }

  function toggleExpanded(id: string) {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--ap-radius-sm)] border bg-card px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--ap-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--ap-border-strong)' }}
      >
        {value ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <Target className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ap-accent)' }} aria-hidden="true" />
            <span className="truncate font-medium">{value.title}</span>
          </span>
        ) : (
          <span style={{ color: 'var(--ap-fg-subtle)' }}>{placeholder}</span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              onClick={(e) => { e.stopPropagation(); onChange(null) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(null) }
              }}
              className="rounded-[var(--ap-radius-xs)] p-0.5 hover:bg-[var(--ap-bg-sunken)]"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--ap-fg-subtle)' }} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label={placeholder}
            className="absolute z-50 mt-1 w-full rounded-[var(--ap-radius-card)] border bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-pop-panel)]"
            style={{ borderColor: 'var(--ap-border)', minWidth: width }}
          >
            <div className="border-b p-2" style={{ borderColor: 'var(--ap-border)' }}>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                  style={{ color: 'var(--ap-fg-subtle)' }}
                  aria-hidden="true"
                />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search objectives & key results…"
                  aria-label="Search objectives and key results"
                  className="w-full rounded-[var(--ap-radius-xs)] py-1.5 pl-7 pr-2 text-[12px] outline-none focus:border-[var(--ap-focus)]"
                  style={{ border: '1px solid var(--ap-border-strong)', color: 'var(--ap-fg)' }}
                />
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-1">
              {showRecents && !search && recent.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ap-fg-subtle)' }}>
                    Recent
                  </p>
                  {recent.map((r) => (
                    <button
                      key={`${r.kind}:${r.id}`}
                      type="button"
                      disabled={disabledSet.has(r.id)}
                      onClick={() => commit(r)}
                      className="flex w-full items-center gap-2 rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-left text-[12px] hover:bg-[var(--ap-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Target className="h-3 w-3 shrink-0" style={{ color: 'var(--ap-accent)' }} aria-hidden="true" />
                      <span className="truncate">{r.title}</span>
                      {r.kind === 'keyResult' && (
                        <span className="ml-auto truncate text-[10px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                          {r.objectiveTitle}
                        </span>
                      )}
                    </button>
                  ))}
                  <div className="my-1 border-t" style={{ borderColor: 'var(--ap-border)' }} />
                </div>
              )}

              {isLoading && (
                <p className="p-3 text-[12px]" style={{ color: 'var(--ap-fg-subtle)' }}>Loading…</p>
              )}

              {!isLoading && filtered.length === 0 && (
                <p className="p-3 text-[12px]" style={{ color: 'var(--ap-fg-subtle)' }}>{emptyLabel}</p>
              )}

              {filtered.map((o) => {
                const isOpen = expanded.has(o.id) || search.trim().length > 0
                const objectiveDisabled = disabledSet.has(o.id)
                return (
                  <div key={o.id}>
                    <div className="flex items-center gap-0.5">
                      {canPickKeyResult && (
                        <button
                          type="button"
                          aria-label={isOpen ? `Collapse ${o.title}` : `Expand ${o.title}`}
                          aria-expanded={isOpen}
                          onClick={() => toggleExpanded(o.id)}
                          className="rounded-[var(--ap-radius-xs)] p-1 hover:bg-[var(--ap-bg-hover)]"
                        >
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={canPickObjective && objectiveDisabled}
                        onClick={() => (canPickObjective ? pickObjective(o) : toggleExpanded(o.id))}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-left text-[12px] font-medium hover:bg-[var(--ap-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40',
                          value?.kind === 'objective' && value.id === o.id && 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]',
                        )}
                      >
                        <span className="truncate">{o.title}</span>
                        {canPickKeyResult && (
                          <span className="ml-auto shrink-0 text-[10px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                            {o.keyResults.length} KR
                          </span>
                        )}
                      </button>
                    </div>

                    {canPickKeyResult && isOpen && (
                      <div className="ml-4 border-l pl-2" style={{ borderColor: 'var(--ap-border)' }}>
                        {o.keyResults.map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            disabled={disabledSet.has(k.id)}
                            onClick={() => pickKeyResult(o, k)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-[var(--ap-radius-xs)] px-2 py-1.5 text-left text-[12px] hover:bg-[var(--ap-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40',
                              value?.kind === 'keyResult' && value.id === k.id && 'bg-[var(--ap-accent-soft)] text-[var(--ap-accent-on-soft)]',
                            )}
                          >
                            <Target className="h-3 w-3 shrink-0" style={{ color: 'var(--ap-accent)' }} aria-hidden="true" />
                            <span className="truncate">{k.title}</span>
                          </button>
                        ))}
                        {o.keyResults.length === 0 && (
                          <p className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                            No key results yet.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default EntityPicker
