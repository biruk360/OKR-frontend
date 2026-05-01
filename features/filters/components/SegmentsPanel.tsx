'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
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
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => item.label.toLowerCase().includes(q)),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-3 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Segments
        </p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search segments…"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {filteredGroups.map((group) => (
          <div key={group.group} className="mb-1">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.group}
            </p>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSegmentSelect(item.id)}
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors',
                  activeSegment === item.id
                    ? 'bg-primary/10 text-primary-600'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No segments found</p>
        )}
      </div>
    </aside>
  )
}
