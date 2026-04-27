'use client'

/**
 * LinkToOkrPopover — cascading objective→KR selector (Sprints v2 §4.4).
 *
 * Single popover, search across both objective and KR titles. Clicking an
 * objective row toggles its KRs inline; clicking a KR fires onChange and closes.
 * "Recent" section persists last 5 picks in localStorage.
 */

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, Target, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const RECENT_KEY = 'okr-link-recent-v1'

export interface OkrLinkValue {
  keyResultId: string
  keyResultTitle: string
  objectiveId: string
  objectiveTitle: string
}

interface ObjectiveWithKrs {
  id: string
  title: string
  level?: string | null
  keyResults: { id: string; title: string }[]
}

interface Props {
  value: OkrLinkValue | null
  onChange: (value: OkrLinkValue | null) => void
  /** Optional preset list. If omitted, the popover fetches /api/objectives + KRs. */
  objectives?: ObjectiveWithKrs[]
  className?: string
  buttonLabel?: string
}

function readRecent(): OkrLinkValue[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, 5) : []
  } catch {
    return []
  }
}

function pushRecent(v: OkrLinkValue) {
  if (typeof window === 'undefined') return
  const cur = readRecent().filter((r) => r.keyResultId !== v.keyResultId)
  cur.unshift(v)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 5)))
  } catch { /* noop */ }
}

export default function LinkToOkrPopover({
  value, onChange, objectives: presetObjectives, className, buttonLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [fetched, setFetched] = useState<ObjectiveWithKrs[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<OkrLinkValue[]>([])

  useEffect(() => {
    if (open) setRecent(readRecent())
  }, [open])

  useEffect(() => {
    if (!open || presetObjectives || fetched) return
    setLoading(true)
    Promise.all([
      fetch('/api/objectives?limit=200').then((r) => r.json()).catch(() => null),
      fetch('/api/key-results?limit=500').then((r) => r.json()).catch(() => null),
    ]).then(([objRes, krRes]) => {
      const objs: any[] = Array.isArray(objRes?.data) ? objRes.data : objRes?.data?.items ?? []
      const krs: any[] = Array.isArray(krRes?.data) ? krRes.data : krRes?.data?.items ?? []
      const byObj = new Map<string, ObjectiveWithKrs>()
      for (const o of objs) {
        byObj.set(o.id, { id: o.id, title: o.title, level: o.level, keyResults: [] })
      }
      for (const k of krs) {
        const oid = k.objectiveId ?? k.objective?.id
        if (!oid) continue
        const node = byObj.get(oid)
        if (node) node.keyResults.push({ id: k.id, title: k.title })
        else byObj.set(oid, { id: oid, title: k.objective?.title ?? '(Objective)', keyResults: [{ id: k.id, title: k.title }] })
      }
      setFetched(Array.from(byObj.values()).filter((o) => o.keyResults.length > 0))
    }).finally(() => setLoading(false))
  }, [open, presetObjectives, fetched])

  const objectives = presetObjectives ?? fetched ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
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
      .filter((x): x is ObjectiveWithKrs => x !== null)
  }, [objectives, query])

  function pick(o: ObjectiveWithKrs, k: { id: string; title: string }) {
    const v: OkrLinkValue = {
      keyResultId: k.id,
      keyResultTitle: k.title,
      objectiveId: o.id,
      objectiveTitle: o.title,
    }
    pushRecent(v)
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border bg-card px-3 py-1.5 text-left text-[12px] hover:bg-muted/40"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        {value ? (
          <span className="inline-flex items-center gap-1.5 truncate">
            <Target className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ap-accent)' }} />
            <span className="truncate font-medium">{value.keyResultTitle}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{buttonLabel ?? 'Link to OKR…'}</span>
        )}
        <span className="flex items-center gap-1">
          {value && (
            <span onClick={clear} className="rounded p-0.5 hover:bg-muted" role="button" tabIndex={0}>
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute z-50 mt-1 w-full min-w-[320px] rounded-[12px] border bg-[var(--ap-bg-raised)] shadow-[var(--ap-shadow-lg)]"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            <div className="border-b p-2" style={{ borderColor: 'var(--ap-border)' }}>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search objectives & key results…"
                  className="w-full rounded-[8px] border-0 bg-muted/40 py-1.5 pl-7 pr-2 text-[12px] outline-none focus:bg-muted"
                />
              </div>
            </div>

            <div className="max-h-[320px] overflow-y-auto p-1">
              {!query && recent.length > 0 && (
                <div className="mb-1">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
                  {recent.map((r) => (
                    <button
                      key={r.keyResultId}
                      type="button"
                      onClick={() => pick({ id: r.objectiveId, title: r.objectiveTitle, keyResults: [] }, { id: r.keyResultId, title: r.keyResultTitle })}
                      className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] hover:bg-muted/60"
                    >
                      <Target className="h-3 w-3 shrink-0" style={{ color: 'var(--ap-accent)' }} />
                      <span className="truncate">{r.keyResultTitle}</span>
                      <span className="ml-auto truncate text-[10px] text-muted-foreground">{r.objectiveTitle}</span>
                    </button>
                  ))}
                  <div className="my-1 border-t" style={{ borderColor: 'var(--ap-border)' }} />
                </div>
              )}

              {loading && <p className="p-3 text-[12px] text-muted-foreground">Loading…</p>}

              {!loading && filtered.length === 0 && (
                <p className="p-3 text-[12px] text-muted-foreground">No matches.</p>
              )}

              {filtered.map((o) => {
                const isOpen = expanded.has(o.id) || query.trim().length > 0
                return (
                  <div key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded((s) => {
                          const n = new Set(s)
                          if (n.has(o.id)) n.delete(o.id)
                          else n.add(o.id)
                          return n
                        })
                      }}
                      className="flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left text-[12px] font-medium hover:bg-muted/60"
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span className="truncate">{o.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{o.keyResults.length} KR</span>
                    </button>
                    {isOpen && (
                      <div className="ml-4 border-l pl-2" style={{ borderColor: 'var(--ap-border)' }}>
                        {o.keyResults.map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            onClick={() => pick(o, k)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] hover:bg-muted/60',
                              value?.keyResultId === k.id && 'bg-muted/60',
                            )}
                          >
                            <Target className="h-3 w-3 shrink-0" style={{ color: 'var(--ap-accent)' }} />
                            <span className="truncate">{k.title}</span>
                          </button>
                        ))}
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
