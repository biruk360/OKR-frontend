import { ActionsWorkspace } from '@/features/performance'
import { requirePerformancePage } from '@/lib/performance'

export default async function PerformanceActionsPage() {
  await requirePerformancePage('page.performance.actions', 'development_action')
  return (
    <div className="space-y-4">
      <div
        className="rounded-[14px] border bg-card px-5 pt-5 pb-4"
        style={{ borderColor: 'var(--ap-border)' }}
      >
        <h1 className="text-[24px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>
          Development Actions
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground" style={{ maxWidth: 720 }}>
          Review, approve, reject, and track reward or development recommendations.
        </p>
      </div>
      <ActionsWorkspace />
    </div>
  )
}
