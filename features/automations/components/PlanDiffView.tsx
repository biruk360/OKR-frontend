'use client'

import { ArrowRight, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlanDiff } from '@/lib/automations/plan-diff'

/**
 * What re-compiling will change (FR-03). Widening changes — runs more often,
 * reads more, costs more, reaches more people — are marked and sorted first,
 * because those are the ones worth a second look before saving.
 */
export function PlanDiffView({ diff }: { diff: PlanDiff }) {
  if (!diff.hasChanges) {
    return (
      <p className="text-body-sm text-ink-secondary">
        The new plan is identical to the current one.
      </p>
    )
  }

  const groups = Array.from(new Set(diff.changes.map((c) => c.group)))

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group}>
          <h4 className="text-body-sm font-semibold text-ink-secondary">{group}</h4>
          <ul className="mt-1.5 space-y-1.5">
            {diff.changes
              .filter((c) => c.group === group)
              .map((change, index) => (
                <li
                  key={`${change.label}-${index}`}
                  className={cn(
                    'rounded-card border px-3 py-2',
                    change.widening ? 'border-warning-500/40 bg-warning-500/5' : 'border-surface-muted'
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {change.widening && <TrendingUp className="h-3.5 w-3.5 shrink-0 text-warning-500" />}
                    <span className="text-body-sm font-medium text-ink-primary">{change.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-body-sm">
                    <span className="text-ink-secondary line-through">{change.before ?? 'not set'}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-ink-tertiary" />
                    <span className="text-ink-primary">{change.after ?? 'not set'}</span>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
