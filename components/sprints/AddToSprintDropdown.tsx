'use client'

/**
 * AddToSprintDropdown — Sprints v2 §4.5 sprint picker.
 * Sections: Active (●), Upcoming (○), divider, "No sprint (backlog)".
 */

import { useEffect, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SprintOption {
  id: string
  name: string
  state: 'PLANNING' | 'ACTIVE' | 'COMPLETED'
  endDate?: string | null
}

interface Props {
  value: string | null
  onChange: (sprintId: string | null) => void
  /** Hide a specific sprint (e.g. exclude self when picking a "next" sprint). */
  excludeSprintId?: string
  className?: string
  placeholder?: string
}

export default function AddToSprintDropdown({
  value, onChange, excludeSprintId, className, placeholder,
}: Props) {
  const [open, setOpen] = useState(false)
  const [sprints, setSprints] = useState<SprintOption[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    Promise.all([
      fetch('/api/sprints/active').then((r) => r.json()).catch(() => null),
      fetch('/api/sprints?state=PLANNING').then((r) => r.json()).catch(() => null),
    ]).then(([activeRes, planningRes]) => {
      const a: any[] = Array.isArray(activeRes?.data) ? activeRes.data : []
      const p: any[] = Array.isArray(planningRes?.data) ? planningRes.data : planningRes?.data?.items ?? []
      const merged = [
        ...a.map((s) => ({ id: s.id, name: s.name, state: 'ACTIVE' as const, endDate: s.endDate })),
        ...p.map((s) => ({ id: s.id, name: s.name, state: 'PLANNING' as const, endDate: s.endDate })),
      ]
      setSprints(merged)
      setLoaded(true)
    })
  }, [open, loaded])

  const active = sprints.filter((s) => s.state === 'ACTIVE' && s.id !== excludeSprintId)
  const planning = sprints.filter((s) => s.state === 'PLANNING' && s.id !== excludeSprintId)
  const selected = sprints.find((s) => s.id === value)

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border bg-card px-3 py-1.5 text-left text-[12px] hover:bg-muted/40"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.name : placeholder ?? 'Add to sprint…'}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(null) }}
              className="rounded p-0.5 hover:bg-muted"
            >
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
            className="absolute z-50 mt-1 w-full min-w-[260px] rounded-[12px] border bg-[var(--ap-bg-raised)] py-1 shadow-[var(--ap-shadow-lg)]"
            style={{ borderColor: 'var(--ap-border)' }}
          >
            {!loaded && <p className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</p>}

            {loaded && active.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active</p>
                {active.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange(s.id); setOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-muted/60"
                  >
                    <span className="size-2 rounded-full" style={{ background: 'var(--ap-accent)' }} />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}

            {loaded && planning.length > 0 && (
              <div>
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</p>
                {planning.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange(s.id); setOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-muted/60"
                  >
                    <span className="size-2 rounded-full border" style={{ borderColor: 'var(--ap-accent)' }} />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="my-1 border-t" style={{ borderColor: 'var(--ap-border)' }} />
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-muted/60"
            >
              <span className="text-muted-foreground">No sprint (backlog)</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
