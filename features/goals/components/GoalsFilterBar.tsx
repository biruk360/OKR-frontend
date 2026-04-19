'use client'

import { useState, useEffect } from 'react'
import { Search, User, Filter, X } from 'lucide-react'
import { useTimeframes } from '@/hooks'
import { cn } from '@/lib/utils'

interface GoalsFilterBarProps {
  filters: {
    timeframe: string
    startDate: string
    endDate: string
    labels: string[]
    owner: string
    search: string
  }
  onFilterChange: (key: string, value: any) => void
}

export default function GoalsFilterBar({ filters, onFilterChange }: GoalsFilterBarProps) {
  const { timeframes } = useTimeframes()
  const [labels, setLabels] = useState<any[]>([])
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/labels')
      .then((r) => r.json())
      .catch(() => ({ success: false, data: [] }))
      .then((labelsData) => {
        if (labelsData?.success) setLabels(labelsData.data || [])
      })
      .catch(() => {})
  }, [])

  const inputBase =
    'h-8 text-xs rounded-md border border-border bg-background px-2.5 focus:outline-none focus:ring-1 focus:ring-ring'

  const activeCount =
    (filters.startDate ? 1 : 0) +
    (filters.endDate ? 1 : 0) +
    (filters.owner ? 1 : 0) +
    filters.labels.length

  return (
    <div className="bg-card px-3 py-2 rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search goals…"
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className={cn(inputBase, 'pl-8 w-full')}
          />
        </div>

        <select
          value={filters.timeframe}
          onChange={(e) => onFilterChange('timeframe', e.target.value)}
          className={cn(inputBase, 'min-w-[140px]')}
        >
          <option value="">All timeframes</option>
          {timeframes.map((tf) => (
            <option key={tf.id} value={tf.id}>
              {tf.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'h-8 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium transition-colors',
            expanded || activeCount > 0
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-background text-muted-foreground hover:bg-muted'
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              onFilterChange('startDate', '')
              onFilterChange('endDate', '')
              onFilterChange('owner', '')
              onFilterChange('labels', [])
            }}
            className="h-8 inline-flex items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Clear filters"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-border flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => onFilterChange('startDate', e.target.value)}
            className={cn(inputBase, 'min-w-[140px]')}
            aria-label="Start date"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => onFilterChange('endDate', e.target.value)}
            className={cn(inputBase, 'min-w-[140px]')}
            aria-label="End date"
          />
          <div className="relative min-w-[180px]">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Owner…"
              value={filters.owner}
              onChange={(e) => onFilterChange('owner', e.target.value)}
              className={cn(inputBase, 'pl-8 w-full')}
            />
          </div>

          {labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 w-full mt-1">
              <span className="text-[11px] text-muted-foreground mr-1">Labels:</span>
              {labels.map((label) => {
                const active = filters.labels.includes(label.id)
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? filters.labels.filter((l) => l !== label.id)
                        : [...filters.labels, label.id]
                      onFilterChange('labels', next)
                    }}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium transition-colors border',
                      active
                        ? 'text-white'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    )}
                    style={
                      active
                        ? { backgroundColor: label.color, borderColor: label.color }
                        : undefined
                    }
                  >
                    {label.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
