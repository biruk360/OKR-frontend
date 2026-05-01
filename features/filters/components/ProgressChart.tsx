'use client'

import { cn } from '@/lib/utils'
import type { ProgressBucket } from '../types'

interface ProgressChartProps {
  buckets: ProgressBucket[]
  onBucketClick?: (bucket: ProgressBucket) => void
}

export function ProgressChart({ buckets, onBucketClick }: ProgressChartProps) {
  const max = Math.max(...buckets.map((b) => b.count), 1)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Progress Distribution
      </p>
      <div className="flex h-28 items-end gap-1">
        {buckets.map((bucket) => {
          const heightPct = (bucket.count / max) * 100
          return (
            <div
              key={bucket.range}
              className="group flex flex-1 flex-col items-center gap-1"
            >
              <span className="text-[10px] text-muted-foreground">{bucket.count > 0 ? bucket.count : ''}</span>
              <button
                type="button"
                onClick={() => onBucketClick?.(bucket)}
                title={`${bucket.range}: ${bucket.count} items`}
                style={{ height: `${Math.max(heightPct, 2)}%` }}
                className={cn(
                  'w-full rounded-t-sm transition-colors',
                  bucket.count > 0
                    ? 'bg-[#2F75B6] hover:bg-[#2563AC]'
                    : 'bg-muted'
                )}
              />
              <span className="text-[9px] text-muted-foreground">{bucket.range}</span>
            </div>
          )
        })}
      </div>
      {buckets.every((b) => b.count === 0) && (
        <p className="mt-2 text-center text-xs text-muted-foreground">No data for these filters</p>
      )}
    </div>
  )
}

export function buildProgressBuckets(progresses: number[]): ProgressBucket[] {
  const buckets: ProgressBucket[] = [
    { range: '0–10', min: 0, max: 10, count: 0 },
    { range: '11–20', min: 11, max: 20, count: 0 },
    { range: '21–30', min: 21, max: 30, count: 0 },
    { range: '31–40', min: 31, max: 40, count: 0 },
    { range: '41–50', min: 41, max: 50, count: 0 },
    { range: '51–60', min: 51, max: 60, count: 0 },
    { range: '61–70', min: 61, max: 70, count: 0 },
    { range: '71–80', min: 71, max: 80, count: 0 },
    { range: '81–90', min: 81, max: 90, count: 0 },
    { range: '91–100', min: 91, max: 100, count: 0 },
  ]
  for (const p of progresses) {
    const idx = Math.min(Math.floor(p / 10), 9)
    buckets[idx].count++
  }
  return buckets
}
