import { LockKeyhole } from 'lucide-react'

export default function OkrLockBanner({ entityType, reopenCount = 0, closedAt }: { entityType: 'Objective' | 'Key Result'; reopenCount?: number; closedAt?: Date | string | null }) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 p-4">
      <div className="flex items-start gap-3">
        <LockKeyhole className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-foreground">{entityType} closed and locked</p>
          <p className="mt-1 text-sm text-muted-foreground">Fields, check-ins, labels, contributors, and the retrospective are frozen. Comments and roll-forward remain available.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {closedAt ? `Closed ${new Date(closedAt).toLocaleDateString()}. ` : ''}
            {reopenCount > 0 ? `Reopened ${reopenCount} time${reopenCount === 1 ? '' : 's'}; the audit scars are permanent.` : 'Reopening requires a reason and creates a permanent audit scar.'}
          </p>
        </div>
      </div>
    </div>
  )
}
