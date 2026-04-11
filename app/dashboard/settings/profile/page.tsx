import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export default async function ProfileSettingsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Get user's departments
  const userDepartments = await prisma.departmentMembership.findMany({
    where: { userId: session.user.id },
    include: {
      department: {
        select: { id: true, name: true }
      }
    }
  })

  // Get user's manager relationships
  const managerRelationships = await prisma.managerRelationship.findMany({
    where: { directReportId: session.user.id },
    include: {
      manager: {
        select: { id: true, name: true, email: true }
      }
    }
  })

  const directReports = await prisma.managerRelationship.findMany({
    where: { managerId: session.user.id },
    include: {
      directReport: {
        select: { id: true, name: true, email: true }
      }
    }
  })

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Profile Information
          </h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <div className="mt-1 text-sm text-gray-900">{session.user.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <div className="mt-1 text-sm text-gray-900">{session.user.email}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Role</label>
              <div className="mt-1 text-sm text-gray-900 capitalize">
                {session.user.role.replace(/_/g, ' ').toLowerCase()}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <div className="mt-1">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Department Memberships */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Department Memberships
          </h3>
          {userDepartments.length === 0 ? (
            <div className="text-sm text-gray-500">No department memberships.</div>
          ) : (
            <div className="space-y-3">
              {userDepartments.map((membership) => (
                <div key={membership.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {membership.department.name}
                    </div>
                    {membership.role && (
                      <div className="text-sm text-gray-500">
                        Role: {membership.role}
                      </div>
                    )}
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Member
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manager Relationships */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Manager Relationships
          </h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Your Manager</h4>
              {managerRelationships.length === 0 ? (
                <div className="text-sm text-gray-500">No manager assigned.</div>
              ) : (
                <div className="space-y-2">
                  {managerRelationships.map((relationship) => (
                    <div key={relationship.id} className="p-3 border rounded-lg">
                      <div className="text-sm font-medium text-gray-900">
                        {relationship.manager.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {relationship.manager.email}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Direct Reports</h4>
              {directReports.length === 0 ? (
                <div className="text-sm text-gray-500">No direct reports.</div>
              ) : (
                <div className="space-y-2">
                  {directReports.map((relationship) => (
                    <div key={relationship.id} className="p-3 border rounded-lg">
                      <div className="text-sm font-medium text-gray-900">
                        {relationship.directReport.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {relationship.directReport.email}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

