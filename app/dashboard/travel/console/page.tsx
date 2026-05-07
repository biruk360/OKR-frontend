/**
 * /dashboard/travel/console — Travel Coordinator review console.
 * Authorization is checked at the API level; this page renders the UI for any
 * authenticated user, and individual API calls fail gracefully if they're not
 * a coordinator.
 */

import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { CoordinatorConsole } from '@/features/daily-trip-plan'

export default async function ConsolePage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  return (
    <div className="space-y-4">
      <PageHeader title="Coordinator Console" description="Review, edit, and approve submitted plans." />
      <CoordinatorConsole />
    </div>
  )
}
