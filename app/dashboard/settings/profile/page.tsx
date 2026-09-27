import { getServerSessionSafe } from '@/lib/auth'
import { loadProfileSettings } from '@/lib/settings/settings-pages.server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Building2, Users, UserCheck } from 'lucide-react'

export default async function ProfileSettingsPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  const { userDepartments, managerRelationships, directReports } = await loadProfileSettings(session.user.id)

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-sm">{session.user.name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-sm">{session.user.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Role</p>
              <p className="text-sm capitalize">{session.user.role.replace(/_/g, ' ').toLowerCase()}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant="secondary" className="bg-success-500/10 text-success-700">Active</Badge>
            </div>
          </div>
          <Separator className="my-6" />
          <Button variant="outline">Edit Profile</Button>
        </CardContent>
      </Card>

      {/* Department Memberships */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4" />
            Department Memberships
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userDepartments.length === 0 ? (
            <EmptyState bare icon={<Building2 className="size-8 text-muted-foreground" aria-hidden="true" />} title="No department memberships." className="py-6" />
          ) : (
            <div className="space-y-3">
              {userDepartments.map((membership) => (
                <div
                  key={membership.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{membership.department.name}</p>
                    {membership.role && (
                      <p className="text-sm text-muted-foreground">Role: {membership.role}</p>
                    )}
                  </div>
                  <Badge variant="secondary">Member</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manager Relationships */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Manager Relationships
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <UserCheck className="size-3.5" />
                Your Manager
              </h4>
              {managerRelationships.length === 0 ? (
                <EmptyState bare icon={<UserCheck className="size-8 text-muted-foreground" aria-hidden="true" />} title="No manager assigned." className="py-6" />
              ) : (
                <div className="space-y-2">
                  {managerRelationships.map((relationship) => (
                    <div key={relationship.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{relationship.manager.name}</p>
                      <p className="text-sm text-muted-foreground">{relationship.manager.email}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Users className="size-3.5" />
                Direct Reports
              </h4>
              {directReports.length === 0 ? (
                <EmptyState bare icon={<Users className="size-8 text-muted-foreground" aria-hidden="true" />} title="No direct reports." className="py-6" />
              ) : (
                <div className="space-y-2">
                  {directReports.map((relationship) => (
                    <div key={relationship.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{relationship.directReport.name}</p>
                      <p className="text-sm text-muted-foreground">{relationship.directReport.email}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

