'use client'

import { cn } from '@/lib/utils'
import type { FiltersTab, KpiData } from '../types'

interface KpiTile {
  label: string
  value: number | string
  color: string
  filterKey?: string
  filterValue?: string
}

interface KpiTilesProps {
  tab: FiltersTab
  data: KpiData
  onTileClick?: (filterKey: string, value: string) => void
}

const COLOR_DOT: Record<string, string> = {
  green: 'bg-[#16A34A]',
  amber: 'bg-[#F59E0B]',
  red: 'bg-[#DC2626]',
  grey: 'bg-[#6B7280]',
  blue: 'bg-[#2F75B6]',
}

const VALUE_COLOR: Record<string, string> = {
  green: 'text-[#16A34A]',
  amber: 'text-[#F59E0B]',
  red: 'text-[#DC2626]',
  grey: 'text-[#6B7280]',
  blue: 'text-[#2F75B6]',
}

function Tile({ tile, onClick }: { tile: KpiTile; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-[120px] flex-1 flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted',
        onClick && 'cursor-pointer'
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('size-2 shrink-0 rounded-full', COLOR_DOT[tile.color])} aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">{tile.label}</span>
      </div>
      <span className={cn('text-2xl font-bold tabular-nums', VALUE_COLOR[tile.color])}>
        {tile.value}
      </span>
    </button>
  )
}

export function KpiTiles({ tab, data, onTileClick }: KpiTilesProps) {
  const tiles: KpiTile[] = []

  if (tab === 'key-results') {
    tiles.push(
      { label: 'Pending', value: data.pending ?? 0, color: 'grey', filterKey: 'confidence', filterValue: 'PENDING' },
      { label: 'On Track', value: data.onTrack ?? 0, color: 'green', filterKey: 'confidence', filterValue: 'ON_TRACK' },
      { label: 'At Risk', value: data.atRisk ?? 0, color: 'amber', filterKey: 'confidence', filterValue: 'AT_RISK' },
      { label: 'Off Track', value: data.offTrack ?? 0, color: 'red', filterKey: 'confidence', filterValue: 'OFF_TRACK' },
      { label: 'Not Measurable', value: data.notMeasurable ?? 0, color: 'grey' },
    )
  } else if (tab === 'objectives') {
    tiles.push(
      { label: 'Avg NCS', value: data.avgNcs ?? 0, color: 'amber' },
      { label: 'Low Confidence', value: data.lowConfidence ?? 0, color: 'red', filterKey: 'confidence', filterValue: 'OFF_TRACK' },
      { label: 'Moderate Confidence', value: data.moderateConfidence ?? 0, color: 'amber', filterKey: 'confidence', filterValue: 'AT_RISK' },
      { label: 'High Confidence', value: data.highConfidence ?? 0, color: 'green', filterKey: 'confidence', filterValue: 'ON_TRACK' },
    )
  } else {
    tiles.push(
      { label: 'Avg Completion', value: `${data.avgCompletion ?? 0}%`, color: 'blue' },
      { label: 'Due This Week', value: data.dueThisWeek ?? 0, color: 'amber' },
      { label: 'Overdue', value: data.overdue ?? 0, color: 'red' },
      { label: 'Completed On Time', value: data.completedOnTime ?? 0, color: 'green' },
    )
  }

  return (
    <div className="flex flex-wrap gap-3 px-4 py-3">
      {tiles.map((tile) => (
        <Tile
          key={tile.label}
          tile={tile}
          onClick={
            tile.filterKey && onTileClick
              ? () => onTileClick(tile.filterKey!, tile.filterValue!)
              : undefined
          }
        />
      ))}
    </div>
  )
}
