'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SEGMENTS_BY_TAB } from '../segments'
import type { FiltersTab, SegmentId } from '../types'

interface SegmentsPanelProps {
  tab: FiltersTab
  activeSegment: SegmentId | null
  onSegmentSelect: (id: SegmentId) => void
}

export function SegmentsPanel({ tab, activeSegment, onSegmentSelect }: SegmentsPanelProps) {
  const [search, setSearch] = useState('')
  const groups = SEGMENTS_BY_TAB[tab]
  const q = search.toLowerCase()

  const filteredGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((item) => item.label.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0)

  return (
    <aside
      className="flex w-52 shrink-0 flex-col border-r"
      style={{ borderColor: 'var(--ap-border)', background: 'var(--ap-bg)' }}
    >
      {/* Search */}
      <div className="border-b px-3 py-3" style={{ borderColor: 'var(--ap-border)' }}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" style={{ color: 'var(--ap-fg-subtle)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search segments…"
            className="h-7 w-full rounded-lg bg-white/60 pl-8 pr-2 text-xs placeholder:text-[var(--ap-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--ap-accent)]/30"
            style={{ border: '1px solid var(--ap-border-strong)', color: 'var(--ap-fg)' }}
          />
        </div>
      </div>

      {/* Segment list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filteredGroups.map((group) => (
          <div key={group.group} className="mb-2">
            <p
              className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--ap-fg-subtle)' }}
            >
              {group.group}
            </p>
            {group.items.map((item) => {
              const active = activeSegment === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSegmentSelect(item.id)}
                  className={cn(
                    'mx-1.5 flex w-[calc(100%-12px)] items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-all duration-150',
                    active
                      ? 'font-semibold'
                      : 'hover:bg-black/5'
                  )}
                  style={active
                    ? { background: 'var(--ap-accent)', color: '#fff' }
                    : { color: 'var(--ap-fg-muted)' }
                  }
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <p className="px-3 py-6 text-center text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
            No segments found
          </p>
        )}
      </div>
    </aside>
  )
}
