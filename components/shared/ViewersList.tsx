'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { ViewerRow } from '@/hooks/useViewTracker'

interface Props {
  endpoint: 'objectives' | 'keyresults'
  entityId: string
  onCountChange?: (count: number) => void
}

function initialsOf(name: string): string {
  return (name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

/** Renders the Viewers tab content — list of unique users who have viewed the entity. */
export default function ViewersList({ endpoint, entityId, onCountChange }: Props) {
  const [viewers, setViewers] = useState<ViewerRow[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/${endpoint}/${entityId}/views`)
      .then(r => r.json())
      .then(json => {
        if (!alive) return
        const rows = (json?.data ?? []) as ViewerRow[]
        setViewers(rows)
        onCountChange?.(rows.length)
      })
      .catch(() => {
        if (!alive) return
        setViewers([])
        onCountChange?.(0)
      })
    return () => { alive = false }
  }, [endpoint, entityId, onCountChange])

  if (viewers === null) {
    return <p className="text-[12px] text-muted-foreground italic px-1">Loading viewers…</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Viewers</p>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
        >
          {viewers.length}
        </span>
      </div>

      {viewers.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic">No views logged yet.</p>
      ) : (
        <ul className="space-y-2">
          {viewers.map(v => (
            <li key={v.id} className="flex items-center gap-2.5 ap-hover-lift rounded-[10px] px-1.5 py-1.5">
              {v.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.avatar} alt={v.name} className="size-8 rounded-full object-cover" />
              ) : (
                <span
                  className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: 'var(--ap-accent)' }}
                >
                  {initialsOf(v.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate">{v.name}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {formatDistanceToNow(new Date(v.viewedAt), { addSuffix: true })}
                </p>
              </div>
              {v.viewCount > 1 && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={{ background: 'var(--ap-accent-soft)', color: 'var(--ap-accent)' }}
                >
                  {v.viewCount}×
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
