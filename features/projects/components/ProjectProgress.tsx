import { cn } from '@/lib/utils'

type ProjectProgressVariant = 'bar' | 'value' | 'ring'

interface ProjectProgressProps {
  actual: number
  planned?: number | null
  variant?: ProjectProgressVariant
  showPlanned?: boolean
  className?: string
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function ProjectProgress({
  actual,
  planned = null,
  variant = 'bar',
  showPlanned = true,
  className,
}: ProjectProgressProps) {
  const actualPct = clampPercent(actual)
  const plannedPct = planned == null ? null : clampPercent(planned)
  const behind = plannedPct != null && plannedPct - actualPct > 5
  const actualLabel = `${Math.round(actualPct)}%`

  if (variant === 'value') {
    return (
      <span className={cn('tabular-nums', behind && 'text-warning-600', className)}>
        {actualLabel}{showPlanned && plannedPct != null ? ` / ${Math.round(plannedPct)}% planned` : ''}
      </span>
    )
  }

  if (variant === 'ring') {
    return (
      <div className={cn('flex flex-col items-center', className)}>
        <div
          className="relative flex size-40 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(var(--ap-accent) ${actualPct * 3.6}deg, var(--ap-bg-sunken) 0)` }}
          role="progressbar"
          aria-label="Project progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(actualPct)}
        >
          <div className="flex size-28 flex-col items-center justify-center rounded-full bg-surface-card">
            <span className="text-[30px] font-semibold tabular-nums text-ink-primary">{actualLabel}</span>
            <span className="text-body-sm text-ink-tertiary">Actual</span>
          </div>
        </div>
        {showPlanned && plannedPct != null && (
          <div className="mt-2 text-body-sm tabular-nums text-ink-tertiary">Planned {Math.round(plannedPct)}%</div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div
        className="relative h-1.5 w-full rounded-full bg-surface-muted"
        role="progressbar"
        aria-label="Project progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(actualPct)}
      >
        <div
          className={cn('h-1.5 rounded-full', behind ? 'bg-warning-500' : 'bg-primary-500')}
          style={{ width: `${actualPct}%` }}
        />
        {showPlanned && plannedPct != null && (
          <div
            className="absolute top-[-2px] h-2.5 w-px bg-ink-secondary"
            style={{ left: `${plannedPct}%` }}
            title={`Planned ${Math.round(plannedPct)}%`}
          />
        )}
      </div>
      <div className="mt-1 text-body-sm tabular-nums text-ink-tertiary">
        {actualLabel}{showPlanned && plannedPct != null ? ` · planned ${Math.round(plannedPct)}%` : ''}
      </div>
    </div>
  )
}
