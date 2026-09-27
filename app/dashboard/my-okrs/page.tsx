import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { loadCheckInQueue } from '@/lib/okr/check-in-queue'
import MyOKRsPage from '@/components/dashboard/MyOKRsPage'
import CheckInQueue from '@/components/dashboard/CheckInQueue'

/**
 * My OKRs — the viewer's own and contributed objectives, with the
 * "Needs a check-in" queue (own KRs overdue / due this week) on top.
 * Browsing everyone else's OKRs lives in the OKR Explorer (/dashboard/okrs-all).
 */
export const dynamic = 'force-dynamic'

export default async function MyOKRsPageRoute() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  const queue = await loadCheckInQueue({ id: session.user.id, role: session.user.role })

  return (
    <div className="space-y-4">
      <CheckInQueue data={queue} />
      <MyOKRsPage />
    </div>
  )
}
