import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { resolveFeaturePermission } from '@/lib/permission-resolver'
import { PageHeader } from '@/components/ui/PageHeader'
import { PACKAGE_FEATURE_KEYS } from '@/types/package'
import DecisionsClient from './DecisionsClient'
import { DecisionsSkeleton } from './DecisionsSkeleton'

/**
 * Decisions (DEC-1 awaiting-my-decision for the decider + the decision log).
 *
 *   ?view=open|decided|deferred|withdrawn|all &timeframeId= &deciderId= &requestedById= &batch= &q=
 *   ?decision=<id> (or ?focus=<id>) opens one decision
 *
 * Record-level visibility and actions come from GET /api/decisions (§8, DEC-4).
 */
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Decisions' }

export default async function DecisionsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN') {
    const allowed = await Promise.all([
      resolveFeaturePermission(session.user.id, PACKAGE_FEATURE_KEYS.module).catch(() => false),
      resolveFeaturePermission(session.user.id, PACKAGE_FEATURE_KEYS.pageDecisions).catch(() => false),
    ])
    if (!allowed.every(Boolean)) redirect('/dashboard')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-0"
        title="Decisions"
        description="Decisions needed from the CEO or another decider: what is waiting, by when, what it unblocks, and what was decided."
      />
      {/* DecisionsClient reads its filters and ?decision= from useSearchParams. */}
      <Suspense fallback={<DecisionsSkeleton bare />}>
        <DecisionsClient currentUserId={session.user.id} />
      </Suspense>
    </div>
  )
}
