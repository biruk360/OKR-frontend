import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import UserManagement from '@/components/settings/UserManagement'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/permissions'

export default async function UsersSettingsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Only admins and executives can access this page
  if (!canManageUsers(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  // Get all users for management
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      designation: true,
      isActive: true,
      isProjectManager: true,
      createdAt: true,
      lastLoginAt: true
    },
    orderBy: { createdAt: 'desc' }
  })

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
