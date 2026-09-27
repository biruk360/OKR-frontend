import { getServerSessionSafe } from '@/lib/auth'
import UserManagement from '@/components/settings/UserManagement'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/permissions'
import { loadUsersSettings } from '@/lib/settings/settings-pages.server'

export default async function UsersSettingsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Only admins and executives can access this page
  if (!canManageUsers(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  // Get all users for management (deleted accounts flagged by the loader)
  const users = await loadUsersSettings()

  return (
    <div className="space-y-6">
      <UserManagement
        initialUsers={users}
        currentUserId={session.user.id}
        currentUserRole={session.user.role}
      />
    </div>
  )
}
