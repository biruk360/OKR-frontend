'use client'

import { cn } from '@/lib/utils'
import type { ProgressBucket } from '../types'

interface ProgressChartProps {
  buckets: ProgressBucket[]
  onBucketClick?: (bucket: ProgressBucket) => void
}

export function ProgressChart({ buckets, onBucketClick }: ProgressChartProps) {
  const max = Math.max(...buckets.map((b) => b.count), 1)
  const isEmpty = buckets.every((b) => b.count === 0)

  return (
    <div
      className="rounded-[var(--ap-radius-md)] p-4"
      style={{
        background: 'var(--ap-bg-raised)',
        border: '1px solid var(--ap-border)',
        boxShadow: 'var(--ap-shadow-sm)',
      }}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ap-fg-subtle)' }}>
        Progress Distribution
      </p>

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
    </div>
  )
}

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
