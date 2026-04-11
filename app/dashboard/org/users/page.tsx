import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { User, Building2, Users, Target } from 'lucide-react'
import { canManageUsers } from '@/lib/permissions'

export default async function UsersDirectoryPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Get all users
  const users = await prisma.user.findMany({
    where: { isActive: true },
    include: {
      departmentMemberships: {
        include: {
          department: {
            select: { id: true, name: true }
          }
        }
      },
      _count: {
        select: { ownedObjectives: true }
      }
    },
    orderBy: { name: 'asc' }
  })

  const canManage = canManageUsers(session.user.role as any)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            View all users in your organization.
          </p>
        </div>
        {canManage && (
          <Link
            href="/dashboard/settings/users"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Manage Users
          </Link>
        )}
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/dashboard/org/users/${user.id}`}
            className="block bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <div className="flex items-center space-x-4 mb-4">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                  <User className="h-6 w-6 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{user.name}</h3>
                <p className="text-sm text-gray-500 truncate">{user.email}</p>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                  {user.role}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-600">
                <Target className="h-4 w-4 mr-2" />
                <span>{user._count.ownedObjectives} Objectives</span>
              </div>
              {user.departmentMemberships.length > 0 && (
                <div className="flex items-center text-sm text-gray-600">
                  <Building2 className="h-4 w-4 mr-2" />
                  <div className="flex flex-wrap gap-1">
                    {user.departmentMemberships.map((membership) => (
                      <span key={membership.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                        {membership.department.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {users.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
        </div>
      )}
    </div>
  )
}

