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
    <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="size-4 text-red-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">This objective needs attention</p>
          <p className="text-xs text-red-700">{issues.join(' · ')}</p>
        </div>
      </div>
      {onRecoverClick && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-red-300 text-red-900 hover:bg-red-100"
          onClick={onRecoverClick}
        >
          Recover plan
        </Button>
      )}
    </div>
  )
}
