import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import TimeframeManagement from '@/components/settings/TimeframeManagement'
import UserManagement from '@/components/settings/UserManagement'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return null
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

  // Get all timeframes for management
  const timeframes = await prisma.timeframe.findMany({
    orderBy: { startDate: 'desc' }
  })

  // Get all users for management (only for admins)
  const users = session.user.role === 'ADMIN' ? await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true
    },
    orderBy: { createdAt: 'desc' }
  }) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* User Management */}
      {session.user.role === 'ADMIN' && (
        <UserManagement initialUsers={users} />
      )}

      {/* Timeframe Management */}
      {session.user.role === 'ADMIN' && (
        <TimeframeManagement timeframes={timeframes} />
      )}

      {/* Profile Settings */}
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

      {/* Notification Preferences */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Notification Preferences
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">Email Notifications</div>
                <div className="text-sm text-gray-500">Receive notifications via email</div>
              </div>
              <button className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-blue-600 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">In-App Notifications</div>
                <div className="text-sm text-gray-500">Receive notifications in the application</div>
              </div>
              <button className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-blue-600 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-900">Weekly Reports</div>
                <div className="text-sm text-gray-500">Receive weekly OKR progress reports</div>
              </div>
              <button className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                <span className="translate-x-0 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Account Actions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Account Actions
          </h3>
          <div className="space-y-3">
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              Change Password
            </button>
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              Export Data
            </button>
            <button className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
