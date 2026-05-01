'use client'

import { cn } from '@/lib/utils'
import type { FiltersTab, KpiData } from '../types'

interface KpiTile {
  label: string
  value: number | string
  tone: 'ontrack' | 'atrisk' | 'offtrack' | 'none' | 'accent'
  filterKey?: string
  filterValue?: string
}

interface KpiTilesProps {
  tab: FiltersTab
  data: KpiData
  onTileClick?: (filterKey: string, value: string) => void
}

function Tile({ tile, onClick }: { tile: KpiTile; onClick?: () => void }) {
  const toneStyles: Record<string, { dot: string; value: string; bg: string }> = {
    ontrack:  { dot: 'bg-[var(--ap-ok)]',     value: 'text-[var(--ap-ok-fg)]',     bg: 'hover:bg-[var(--ap-ok-bg)]'     },
    atrisk:   { dot: 'bg-[var(--ap-warn)]',   value: 'text-[var(--ap-warn-fg)]',   bg: 'hover:bg-[var(--ap-warn-bg)]'   },
    offtrack: { dot: 'bg-[var(--ap-danger)]', value: 'text-[var(--ap-danger-fg)]', bg: 'hover:bg-[var(--ap-danger-bg)]' },
    none:     { dot: 'bg-[var(--ap-none)]',   value: 'text-[var(--ap-fg-muted)]',  bg: 'hover:bg-[var(--ap-none-bg)]'   },
    accent:   { dot: 'bg-[var(--ap-accent)]', value: 'text-[var(--ap-accent)]',    bg: 'hover:bg-[var(--ap-accent)]/8'  },
  }
  const s = toneStyles[tile.tone]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'ap-card group flex min-w-[130px] flex-1 flex-col gap-2 rounded-[var(--ap-radius-md)] p-4 text-left transition-all duration-[var(--ap-duration-base)]',
        onClick ? cn('cursor-pointer', s.bg) : 'cursor-default'
      )}
      style={{
        background: 'var(--ap-bg-raised)',
        boxShadow: 'var(--ap-shadow-sm)',
        border: '1px solid var(--ap-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className={cn('size-2 shrink-0 rounded-full', s.dot)} aria-hidden />
        <span className="text-xs font-medium" style={{ color: 'var(--ap-fg-subtle)' }}>
          {tile.label}
        </span>
      </div>
      <span className={cn('text-3xl font-bold tabular-nums tracking-tight', s.value)}>
        {tile.value}
      </span>
    </button>
  )
}

export function KpiTiles({ tab, data, onTileClick }: KpiTilesProps) {
  const tiles: KpiTile[] = []

  if (tab === 'key-results') {
    tiles.push(
      { label: 'Pending',        value: data.pending ?? 0,       tone: 'none',     filterKey: 'confidence', filterValue: 'PENDING'   },
      { label: 'On Track',       value: data.onTrack ?? 0,       tone: 'ontrack',  filterKey: 'confidence', filterValue: 'ON_TRACK'  },
      { label: 'At Risk',        value: data.atRisk ?? 0,        tone: 'atrisk',   filterKey: 'confidence', filterValue: 'AT_RISK'   },
      { label: 'Off Track',      value: data.offTrack ?? 0,      tone: 'offtrack', filterKey: 'confidence', filterValue: 'OFF_TRACK' },
      { label: 'Not Measurable', value: data.notMeasurable ?? 0, tone: 'none' },
    )
  } else if (tab === 'objectives') {
    tiles.push(
      { label: 'Avg NCS',             value: data.avgNcs ?? 0,           tone: 'accent'   },
      { label: 'Low Confidence',      value: data.lowConfidence ?? 0,    tone: 'offtrack', filterKey: 'confidence', filterValue: 'OFF_TRACK' },
      { label: 'Moderate Confidence', value: data.moderateConfidence ?? 0, tone: 'atrisk', filterKey: 'confidence', filterValue: 'AT_RISK'   },
      { label: 'High Confidence',     value: data.highConfidence ?? 0,   tone: 'ontrack',  filterKey: 'confidence', filterValue: 'ON_TRACK'  },
    )
  } else {
    tiles.push(
      { label: 'Avg Completion',    value: `${data.avgCompletion ?? 0}%`, tone: 'accent'   },
      { label: 'Due This Week',     value: data.dueThisWeek ?? 0,         tone: 'atrisk'   },
      { label: 'Overdue',           value: data.overdue ?? 0,             tone: 'offtrack' },
      { label: 'Completed On Time', value: data.completedOnTime ?? 0,     tone: 'ontrack'  },
    )
  }

  return (
    <div className="flex flex-wrap gap-3 px-5 py-4">
      {tiles.map((tile) => (
        <Tile
          key={tile.label}
          tile={tile}
          onClick={tile.filterKey && onTileClick ? () => onTileClick(tile.filterKey!, tile.filterValue!) : undefined}
        />
      ))}
    </div>
  )
}
