import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, Building2, User, Target } from 'lucide-react'

export default async function TeamsDirectoryPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Get all departments (teams)
  const departments = await prisma.department.findMany({
    where: { isActive: true },
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
            className="block bg-card rounded-lg border border-border p-6 hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-blue-600" />
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
                      <div className="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center">
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
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <Users className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No teams found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Teams will appear here once they are created.
          </p>
        </div>
      )}
    </div>
  )
}

