import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Building2, Users, UserCheck } from 'lucide-react'

export default async function ProfileSettingsPage() {
  const session = await getServerSessionSafe()

  if (!session) {
    redirect('/auth/signin')
  }

  const [userDepartments, managerRelationships, directReports] = await Promise.all([
    prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      include: { department: { select: { id: true, name: true } } },
    }),
    prisma.managerRelationship.findMany({
      where: { directReportId: session.user.id },
      include: { manager: { select: { id: true, name: true, email: true } } },
    }),
    prisma.managerRelationship.findMany({
      where: { managerId: session.user.id },
      include: { directReport: { select: { id: true, name: true, email: true } } },
    }),
  ])

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
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700">Active</Badge>
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
            <p className="text-sm text-muted-foreground">No department memberships.</p>
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
                <p className="text-sm text-muted-foreground">No manager assigned.</p>
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
                <p className="text-sm text-muted-foreground">No direct reports.</p>
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

