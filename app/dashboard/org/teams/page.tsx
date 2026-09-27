import { getServerSessionSafe } from '@/lib/auth'
import { loadTeamsDirectory } from '@/features/admin-org/services/org-pages.server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/EmptyState'
import { Users, Building2, User, Target } from 'lucide-react'

export default async function TeamsDirectoryPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  const departments = await loadTeamsDirectory()

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          View all teams and departments in your organization.
        </p>
      </div>

      {/* Teams Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {departments.map((department) => (
          <Link
            key={department.id}
            href={`/dashboard/org/teams/${department.id}`}
            className="block bg-card rounded-lg border border-border p-6 hover:shadow-md transition-shadow ap-focus-ring"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{department.name}</h3>
                  <p className="text-sm text-muted-foreground">{department._count.memberships} members</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center text-sm text-muted-foreground">
                <Users className="h-4 w-4 mr-2" />
                <span>{department._count.memberships} Members</span>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <Target className="h-4 w-4 mr-2" />
                <span>{department._count.objectives} Objectives</span>
              </div>
            </div>

            {/* Team Members Preview */}
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Team Members</h4>
              <div className="flex flex-wrap gap-2">
                {department.memberships.slice(0, 5).map((membership) => (
                  <div key={membership.id} className="flex items-center space-x-2">
                    {membership.user.avatar ? (
                      <img
                        src={membership.user.avatar}
                        alt={membership.user.name}
                        className="h-6 w-6 rounded-full"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-surface-muted flex items-center justify-center">
                        <span className="text-xs font-medium text-muted-foreground">
                          {membership.user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground">{membership.user.name}</span>
                  </div>
                ))}
                {department.memberships.length > 5 && (
                  <span className="text-xs text-muted-foreground">
                    +{department.memberships.length - 5} more
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {departments.length === 0 && (
        <EmptyState
          icon={<Users className="h-10 w-10 text-muted-foreground" />}
          title="No teams found"
          description="Teams will appear here once they are created."
        />
      )}
    </div>
  )
}

