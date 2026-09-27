import { getServerSessionSafe } from '@/lib/auth'
import TimeframeManagement from '@/components/settings/TimeframeManagement'
import { redirect } from 'next/navigation'
import { canManageTimeframes } from '@/lib/permissions'
import { loadTimeframesSettings } from '@/lib/settings/settings-pages.server'

export default async function TimeframesSettingsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Only admins and executives can access this page
  if (!canManageTimeframes(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  // Get all timeframes for management
  const timeframes = await loadTimeframesSettings()

  return (
    <div className="space-y-6">
      <TimeframeManagement timeframes={timeframes} />
    </div>
  )
}
