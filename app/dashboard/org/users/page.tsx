import { getServerSessionSafe } from '@/lib/auth'
import { loadUsersDirectory } from '@/features/admin-org/services/org-pages.server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/EmptyState'
import { User, Building2, Users, Target } from 'lucide-react'

export default async function UsersDirectoryPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  const { users, canManage } = await loadUsersDirectory(session.user)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            View all users in your organization.
          </p>
        </div>
        {canManage && (
          <Link
            href="/dashboard/settings/users"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary-600 hover:bg-primary-700"
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
            className="block bg-card rounded-lg border border-border p-6 hover:shadow-md transition-shadow ap-focus-ring"
          >
            <div className="flex items-center space-x-4 mb-4">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-primary-500 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-foreground truncate">{user.name}</h3>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 mt-1">
                  {user.role}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center text-sm text-muted-foreground">
                <Target className="h-4 w-4 mr-2" />
                <span>{user._count.ownedObjectives} Objectives</span>
              </div>
              {user.departmentMemberships.length > 0 && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4 mr-2" />
                  <div className="flex flex-wrap gap-1">
                    {user.departmentMemberships.map((membership) => (
                      <span key={membership.id} className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
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
        <EmptyState
          icon={<Users className="h-10 w-10 text-muted-foreground" />}
          title="No users found"
        />
      )}
    </div>
  )
}

