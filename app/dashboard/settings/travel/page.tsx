/**
 * /dashboard/settings/travel — admin DTP settings.
 * Authorization gate is enforced at the /api/dtp/settings endpoint; the form
 * shows a friendly error if the caller isn't an admin.
 */

import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { TravelSettingsForm } from '@/features/daily-trip-plan'

export default async function TravelSettingsPage() {
  const session = await getServerSessionSafe()
  if (!session) redirect('/auth/signin')
  if (session.user.role !== 'ADMIN' && session.user.role !== 'EXECUTIVE') redirect('/dashboard')
  return (
    <div className="space-y-4">
      <PageHeader
        title="Travel & Mobility Settings"
        description="Approval routing, SLAs, working hours, traffic, optimization, and notifications."
      />
      <TravelSettingsForm />
    </div>
  )
}
