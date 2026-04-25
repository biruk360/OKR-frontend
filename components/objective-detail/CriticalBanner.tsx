'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  progress: number
  expectedProgress: number
  unassignedCount: number
  lastUpdatedDays: number
  onRecoverClick?: () => void
}

/**
 * Apple Pro attention strip. Soft amber tint, 1px border, single-line.
 * Sits directly above the hero card.
 */
export default function CriticalBanner({
  progress, expectedProgress, unassignedCount, lastUpdatedDays, onRecoverClick,
}: Props) {
  const gap = expectedProgress - progress
  const issues: string[] = []

  if (gap > 20) issues.push(`${gap}pt behind expected pace`)
  if (unassignedCount > 0) issues.push(`${unassignedCount} unassigned KR${unassignedCount > 1 ? 's' : ''}`)
  if (lastUpdatedDays > 14) issues.push(`No check-in for ${lastUpdatedDays} days`)

  if (issues.length === 0) return null

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-[14px] border px-4 py-3"
      style={{
        background: 'rgba(255, 149, 0, 0.10)',
        borderColor: 'rgba(255, 149, 0, 0.28)',
        color: 'var(--ap-warn-fg)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgba(255, 149, 0, 0.18)' }}
        >
          <AlertTriangle className="size-4" style={{ color: 'var(--ap-orange)' }} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--ap-warn-fg)' }}>
            This objective needs attention
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--ap-warn-fg)', opacity: 0.85 }}>
            {issues.join(' · ')}
          </p>
        </div>
      </div>
      {onRecoverClick && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 rounded-[10px]"
          style={{ borderColor: 'rgba(255, 149, 0, 0.4)', color: 'var(--ap-warn-fg)' }}
          onClick={onRecoverClick}
        >
          Recover plan
        </Button>
      )}
    </div>
  )
}
