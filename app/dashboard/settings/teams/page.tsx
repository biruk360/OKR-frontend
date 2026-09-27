import { getServerSessionSafe } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/permissions'
import { loadTeamsSettings } from '@/lib/settings/settings-pages.server'
import TeamsManagement from '@/components/settings/TeamsManagement'

export default async function TeamsSettingsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Only admins and executives can access this page
  if (!canManageUsers(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  // Get all departments (teams)
  const departments = await loadTeamsSettings()

  return (
    <div className="space-y-6">
      <TeamsManagement initialDepartments={departments} />
    </div>
  )
}
