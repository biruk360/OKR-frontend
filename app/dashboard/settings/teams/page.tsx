import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/permissions'
import TeamsManagement from '@/components/settings/TeamsManagement'

export default async function TeamsSettingsPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Only admins and executives can access this page
  if (!canManageUsers(session.user.role as any)) {
    redirect('/dashboard/settings/profile')
  }

  // Get all departments (teams)
  const departments = await prisma.department.findMany({
    include: {
      memberships: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, role: true }
          }
        }
      },
      _count: {
        select: { memberships: true, objectives: true }
      }
    },
    orderBy: { name: 'asc' }
  })

  return (
    <div className="space-y-6">
      <TeamsManagement initialDepartments={departments} />
    </div>
  )
}

