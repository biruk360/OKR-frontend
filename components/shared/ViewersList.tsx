'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { ViewerRow } from '@/hooks/useViewTracker'
import { Eye } from 'lucide-react'
import { Skeleton, SkeletonAvatar } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { PersonTooltip } from '@/components/shared/UserAvatar'

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
    return (
      <div className="space-y-2 px-1" aria-busy="true" aria-label="Loading viewers">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <SkeletonAvatar size={32} />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Viewers</p>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-semibold tabular-nums"
          style={{ background: 'var(--ap-bg-sunken)', color: 'var(--ap-fg-muted)' }}
        >
          {viewers.length}
        </span>
      </div>

      {viewers.length === 0 ? (
        <EmptyState bare icon={Eye} title="No views logged yet" />
      ) : (
        <ul className="space-y-2">
          {viewers.map(v => (
            <li key={v.id} className="flex items-center gap-2.5 ap-hover-lift rounded-[var(--ap-radius-sm)] px-1.5 py-1.5">
              {v.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.avatar} alt={v.name} className="size-8 rounded-full object-cover" />
              ) : (
                <span
                  className="flex size-8 items-center justify-center rounded-full text-caption font-semibold text-[color:var(--ap-accent-fg)]"
                  style={{ background: 'var(--ap-accent)' }}
                >
                  {initialsOf(v.name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <PersonTooltip person={v} whenTruncated>
                  <p className="text-body-sm font-medium truncate">{v.name}</p>
                </PersonTooltip>
                <p className="text-caption text-muted-foreground tabular-nums">
                  {formatDistanceToNow(new Date(v.viewedAt), { addSuffix: true })}
                </p>
              </div>
              {v.viewCount > 1 && (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-micro font-semibold tabular-nums"
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
