'use client'

import { cn } from '@/lib/utils'
import type { ProgressBucket, ProgressTimeseriesPoint, ConfidenceBreakdown, FiltersTab } from '../types'

// ─── Card shell ───────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col rounded-[var(--ap-radius-md)] p-4"
      style={{
        background: 'var(--ap-bg-raised)',
        border: '1px solid var(--ap-border)',
        boxShadow: 'var(--ap-shadow-sm)',
      }}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

// ─── Progress Distribution (existing) ─────────────────────────────────────────

interface ProgressChartProps {
  buckets: ProgressBucket[]
  onBucketClick?: (bucket: ProgressBucket) => void
}

export function ProgressChart({ buckets, onBucketClick }: ProgressChartProps) {
  const max = Math.max(...buckets.map((b) => b.count), 1)
  const isEmpty = buckets.every((b) => b.count === 0)

  return (
    <Card title="Progress Distribution">
      {isEmpty ? (
        <p className="py-6 text-center text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
          No data for these filters
        </p>
      ) : (
        <div className="flex h-24 items-end gap-1">
          {buckets.map((bucket) => {
            const heightPct = bucket.count > 0 ? Math.max((bucket.count / max) * 100, 6) : 2
            return (
              <div key={bucket.range} className="group flex flex-1 flex-col items-center gap-1">
                <span
                  className="text-[9px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: 'var(--ap-fg-subtle)' }}
                >
                  {bucket.count > 0 ? bucket.count : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onBucketClick?.(bucket)}
                  title={`${bucket.range}%: ${bucket.count} items`}
                  style={{ height: `${heightPct}%`, background: bucket.count > 0 ? 'var(--ap-accent)' : 'var(--ap-border-strong)' }}
                  className={cn(
                    'w-full rounded-t-sm transition-all duration-[var(--ap-duration-base)]',
                    bucket.count > 0 && 'hover:opacity-75 cursor-pointer'
                  )}
                />
                <span className="text-[9px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                  {bucket.range}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Confidence Breakdown ─────────────────────────────────────────────────────

interface ConfidenceChartProps {
  data: ConfidenceBreakdown
  tab: FiltersTab
  onSegmentClick?: (key: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'PENDING') => void
}

export function ConfidenceChart({ data, tab, onSegmentClick }: ConfidenceChartProps) {
  const total = data.onTrack + data.atRisk + data.offTrack + data.pending
  const isEmpty = total === 0

  const rows = [
    { key: 'ON_TRACK' as const, label: tab === 'objectives' ? 'High' : 'On Track', count: data.onTrack, color: 'var(--ap-success, #16a34a)' },
    { key: 'AT_RISK' as const,  label: tab === 'objectives' ? 'Moderate' : 'At Risk', count: data.atRisk, color: 'var(--ap-warning, #d97706)' },
    { key: 'OFF_TRACK' as const, label: tab === 'objectives' ? 'Low' : 'Off Track', count: data.offTrack, color: 'var(--ap-danger, #dc2626)' },
    { key: 'PENDING' as const,   label: 'Pending', count: data.pending, color: 'var(--ap-border-strong)' },
  ]

  return (
    <Card title="Confidence Breakdown">
      {isEmpty ? (
        <p className="py-6 text-center text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
          No data for these filters
        </p>
      ) : (
        <div className="flex h-24 flex-col justify-between gap-2">
          {/* Stacked bar */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--ap-border)' }}>
            {rows.map((r) => {
              const pct = total > 0 ? (r.count / total) * 100 : 0
              if (pct === 0) return null
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onSegmentClick?.(r.key)}
                  title={`${r.label}: ${r.count} (${Math.round(pct)}%)`}
                  className="h-full transition-opacity hover:opacity-75"
                  style={{ width: `${pct}%`, background: r.color }}
                />
              )
            })}
          </div>
          {/* Legend */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {rows.map((r) => {
              const pct = total > 0 ? Math.round((r.count / total) * 100) : 0
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onSegmentClick?.(r.key)}
                  className="flex items-center justify-between gap-2 text-[11px] transition-opacity hover:opacity-70"
                  style={{ color: 'var(--ap-fg-muted)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--ap-fg)' }}>
                    {r.count}
                    <span className="ml-1 text-[10px]" style={{ color: 'var(--ap-fg-subtle)' }}>
                      {pct}%
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Progress Over Time (sparkline) ───────────────────────────────────────────

interface ProgressTimeseriesChartProps {
  data: ProgressTimeseriesPoint[]
  isLoading?: boolean
}

export function ProgressTimeseriesChart({ data, isLoading }: ProgressTimeseriesChartProps) {
  const points = data ?? []
  const isEmpty = !isLoading && (points.length === 0 || points.every((p) => p.krCount === 0))

  const W = 100
  const H = 40
  const path = (() => {
    if (points.length === 0) return ''
    const stepX = points.length > 1 ? W / (points.length - 1) : 0
    return points
      .map((p, i) => {
        const x = i * stepX
        const y = H - (p.avgProgress / 100) * H
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  })()
  const areaPath = path ? `${path} L ${W} ${H} L 0 ${H} Z` : ''

  const last = points[points.length - 1]?.avgProgress ?? 0
  const first = points[0]?.avgProgress ?? 0
  const delta = Math.round(last - first)

  return (
    <Card title="Progress Over Time">
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="size-4 animate-spin rounded-full border-2 border-[var(--ap-accent)] border-t-transparent" />
        </div>
      ) : isEmpty ? (
        <p className="py-6 text-center text-xs" style={{ color: 'var(--ap-fg-subtle)' }}>
          No check-in history yet
        </p>
      ) : (
        <div className="flex h-24 flex-col justify-between">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums" style={{ color: 'var(--ap-fg)' }}>
                {Math.round(last)}%
              </span>
              <span
                className="text-[11px] font-medium tabular-nums"
                style={{ color: delta > 0 ? 'var(--ap-success, #16a34a)' : delta < 0 ? 'var(--ap-danger, #dc2626)' : 'var(--ap-fg-subtle)' }}
              >
                {delta > 0 ? '+' : ''}
                {delta} pts
              </span>
            </div>
            <span className="text-[10px]" style={{ color: 'var(--ap-fg-subtle)' }}>
              last {points.length} wks
            </span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-full">
            <path d={areaPath} fill="var(--ap-accent)" opacity="0.12" />
            <path d={path} fill="none" stroke="var(--ap-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="flex justify-between text-[9px]" style={{ color: 'var(--ap-fg-subtle)' }}>
            <span>{points[0]?.label}</span>
            <span>{last && points[points.length - 1]?.label}</span>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildProgressBuckets(progresses: number[]): ProgressBucket[] {
  const buckets: ProgressBucket[] = [
    { range: '0–10',  min: 0,  max: 10,  count: 0 },
    { range: '11–20', min: 11, max: 20,  count: 0 },
    { range: '21–30', min: 21, max: 30,  count: 0 },
    { range: '31–40', min: 31, max: 40,  count: 0 },
    { range: '41–50', min: 41, max: 50,  count: 0 },
    { range: '51–60', min: 51, max: 60,  count: 0 },
    { range: '61–70', min: 61, max: 70,  count: 0 },
    { range: '71–80', min: 71, max: 80,  count: 0 },
    { range: '81–90', min: 81, max: 90,  count: 0 },
    { range: '91–100',min: 91, max: 100, count: 0 },
  ]
  for (const p of progresses) {
    const idx = Math.min(Math.floor(p / 10), 9)
    buckets[idx].count++
  }
  return buckets
}
