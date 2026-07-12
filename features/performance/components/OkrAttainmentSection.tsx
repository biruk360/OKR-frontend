'use client'

import { cn, formatDate, getProgressColor } from '@/lib/utils'
import type { OkrAttainment } from '../types'
import { SectionCard } from './SectionCard'

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', getProgressColor(clamped))} style={{ width: `${clamped}%` }} />
    </div>
  )
}

/**
 * Compact employee-scoped OKR attainment list for the evaluation period:
 * owned objectives with progress bars and their key results with
 * current / target attainment.
 */
export function OkrAttainmentSection({ attainment }: { attainment: OkrAttainment }) {
  return (
    <SectionCard
      title="OKR attainment"
      actions={
        <span className="text-xs text-muted-foreground">
          {formatDate(attainment.periodStart)} – {formatDate(attainment.periodEnd)}
        </span>
      }
    >
      <>
        {attainment.objectives.length === 0 ? (
          <p className="text-sm text-muted-foreground">No owned objectives overlapped this review period.</p>
        ) : (
          <div className="divide-y divide-border">
            {attainment.objectives.map((objective) => (
              <div key={objective.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{objective.title}</p>
                  <span className="shrink-0 text-sm font-semibold">{Math.round(objective.progress)}%</span>
                </div>
                <ProgressBar value={objective.progress} />
                <p className="text-xs text-muted-foreground">{objective.timeframeName}</p>
                {objective.keyResults.length > 0 && (
                  <div className="space-y-2 pl-4">
                    {objective.keyResults.map((keyResult) => (
                      <div key={keyResult.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">{keyResult.title}</p>
                          <span className="shrink-0 text-xs font-medium">
                            {keyResult.currentValue} / {keyResult.targetValue} {keyResult.unit} · {Math.round(keyResult.progress)}%
                          </span>
                        </div>
                        <ProgressBar value={keyResult.progress} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    </SectionCard>
  )
}
