'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { ChevronRight, Search, Loader2 } from 'lucide-react'
import { useCheckInPickerStore } from '@/lib/stores/check-in-picker-store'
import { CHECK_IN_DUE_HINTS_QUERY_KEY, type CheckInDueHint } from './check-in-due-hints'
import { EmptyState } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

interface KeyResultRow {
  id: string
  title: string
  currentValue: number
  targetValue: number
  unit: string | null
  status: string
  ownerId: string
  objective: { id: string; title: string } | null
  index: number
}

interface ObjectiveApi {
  id: string
  title: string
  keyResults?: Array<{
    id: string
    title: string
    currentValue: number
    targetValue: number
    unit: string | null
    status: string
    ownerId: string
  }>
}

async function fetchMyActiveKrs(userId: string): Promise<KeyResultRow[]> {
  const params = new URLSearchParams({ status: 'ACTIVE', limit: '500', ownerId: userId })
  const res = await fetch(`/api/objectives?${params}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Failed to load')
  const objectives: ObjectiveApi[] = json.data ?? []
  const rows: KeyResultRow[] = []
  for (const obj of objectives) {
    const krs = (obj.keyResults ?? []).filter(
      (k) => k.ownerId === userId && k.status === 'ACTIVE',
    )
    krs.forEach((k, i) => {
      rows.push({
        id: k.id,
        title: k.title,
        currentValue: Number(k.currentValue) || 0,
        targetValue: Number(k.targetValue) || 0,
        unit: k.unit,
        status: k.status,
        ownerId: k.ownerId,
        objective: { id: obj.id, title: obj.title },
        index: i + 1,
      })
    })
  }
  return rows
}

export default function CheckInPickerModal() {
  const isOpen = useCheckInPickerStore((s) => s.isOpen)
  const closePicker = useCheckInPickerStore((s) => s.closePicker)
  const selectKr = useCheckInPickerStore((s) => s.selectKr)
  const { data: session } = useSession()
  const userId = session?.user?.id

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setActiveIdx(0)
    }
  }, [isOpen])

  const { data: krs = [], isFetching } = useQuery({
    queryKey: ['my-active-krs', userId],
    queryFn: () => fetchMyActiveKrs(userId as string),
    enabled: isOpen && !!userId,
    staleTime: 30_000,
  })

  // Seeded by openers that know which KRs are due (e.g. the home page); never fetched here.
  const { data: dueHints = [] } = useQuery<CheckInDueHint[]>({
    queryKey: CHECK_IN_DUE_HINTS_QUERY_KEY,
    queryFn: () => [],
    enabled: false,
    staleTime: Infinity,
  })
  const dueState = useMemo(() => new Map(dueHints.map((h, i) => [h.id, { state: h.state, order: i }])), [dueHints])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return krs
    return krs.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        (k.objective?.title?.toLowerCase().includes(q) ?? false),
    )
  }, [krs, query])

  const grouped = useMemo(() => {
    const map = new Map<string, { objective: { id: string; title: string }; rows: KeyResultRow[] }>()
    // KRs that need a check-in come first, overdue before due.
    const dueRows = filtered
      .filter((r) => dueState.has(r.id))
      .sort((a, b) => dueState.get(a.id)!.order - dueState.get(b.id)!.order)
    if (dueRows.length > 0) {
      map.set('_due', { objective: { id: '_due', title: 'Needs a check-in' }, rows: dueRows })
    }
    for (const r of filtered) {
      if (dueState.has(r.id)) continue
      const oid = r.objective?.id ?? '_none'
      const otitle = r.objective?.title ?? 'Other'
      if (!map.has(oid)) map.set(oid, { objective: { id: oid, title: otitle }, rows: [] })
      map.get(oid)!.rows.push(r)
    }
    return Array.from(map.values())
  }, [filtered, dueState])

  // Flat list in render order — keyboard navigation indexes into this.
  const ordered = useMemo(() => grouped.flatMap((g) => g.rows), [grouped])

  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0)
  }, [filtered.length, activeIdx])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      // Escape is handled by the Modal (Radix Dialog) → onClose.
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const row = ordered[activeIdx]
        if (row) selectKr(row.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, filtered, ordered, activeIdx, selectKr])

  let runningIdx = -1

  return (
    <Modal
      open={isOpen}
      onClose={closePicker}
      title="Check-in picker"
      hideHeader
      showCloseButton={false}
      className="gap-0 overflow-hidden p-0 sm:max-w-[480px]"
    >
      <div
        className="flex max-h-[480px] flex-col overflow-hidden rounded-[var(--ap-radius-md)]"
        style={{ background: 'var(--ap-bg-raised)', color: 'var(--ap-fg)' }}
      >
        <div
          className="flex h-11 items-center gap-2 px-4"
          style={{ borderBottom: '1px solid var(--ap-border)' }}
        >
          <Search className="size-4" style={{ color: 'var(--ap-fg-subtle)' }} />
          <input
            autoFocus
            aria-label="Find a key result"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIdx(0)
            }}
            placeholder="Find a key result to check in on…"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--ap-fg-subtle)]"
          />
          {isFetching && (
            <Loader2 className="size-4 animate-spin" style={{ color: 'var(--ap-fg-subtle)' }} />
          )}
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && !isFetching ? (
            <div className="py-6">
              <EmptyState
                title="No key results to check in on"
                description="You'll see KRs you own here."
                bare
              />
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.objective.id} className="mb-2">
                <div
                  className="px-2 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--ap-fg-subtle)' }}
                >
                  {g.objective.title}
                </div>
                {g.rows.map((r) => {
                  runningIdx += 1
                  const isActive = runningIdx === activeIdx
                  const localIdx = runningIdx
                  const unit = r.unit || ''
                  const due = dueState.get(r.id)?.state
                  return (
                    <button
                      type="button"
                      key={r.id}
                      onMouseEnter={() => setActiveIdx(localIdx)}
                      onClick={() => selectKr(r.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[var(--ap-radius-sm)] px-2.5 py-2 text-left text-body-sm outline-none',
                        isActive && 'bg-[var(--ap-bg-hover)]',
                      )}
                    >
                      <span
                        className="inline-flex h-5 shrink-0 items-center justify-center rounded-[var(--ap-radius-sm)] px-1.5 font-mono text-micro font-semibold"
                        style={{
                          background: 'var(--ap-bg-sunken)',
                          color: 'var(--ap-fg-subtle)',
                        }}
                      >
                        KR{r.index}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span
                          className="block truncate text-caption"
                          style={{ color: 'var(--ap-fg-subtle)' }}
                        >
                          {r.objective?.title}
                        </span>
                      </span>
                      {due && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold"
                          style={{
                            background: 'var(--ap-bg-sunken)',
                            color: due === 'overdue' ? 'var(--ap-red)' : 'var(--ap-orange)',
                          }}
                        >
                          {due === 'overdue' ? 'Overdue' : 'Due'}
                        </span>
                      )}
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 font-mono text-micro"
                        style={{
                          background: 'var(--ap-bg-sunken)',
                          color: 'var(--ap-fg-subtle)',
                        }}
                      >
                        {unit}
                        {Math.round(r.currentValue)} / {Math.round(r.targetValue)}
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0"
                        style={{ color: 'var(--ap-fg-subtle)' }}
                      />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div
          className="flex h-10 items-center justify-between px-4 text-caption"
          style={{
            borderTop: '1px solid var(--ap-border)',
            background: 'var(--ap-bg-sunken)',
            color: 'var(--ap-fg-subtle)',
          }}
        >
          <span>↑↓ navigate · ↵ select · esc close</span>
        </div>
      </div>
    </Modal>
  )
}
