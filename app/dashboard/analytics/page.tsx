import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function AnalyticsPage() {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  // Get analytics data
  const objectives = await prisma.objective.findMany({
    where: { status: 'ACTIVE' },
    include: {
      keyResults: true,
      timeframe: true,
      department: {
        select: { id: true, name: true }
      }
    }
  })

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    include: {
      _count: {
        select: { objectives: true }
      }
    }
  })

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-500">
          Advanced analytics and insights for your OKR system.
        </p>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">📊</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total OKRs</dt>
                  <dd className="text-lg font-medium text-gray-900">{objectives.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">🎯</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Success Rate</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {objectives.length > 0 
                      ? Math.round((objectives.filter(obj => obj.progress >= 75).length / objectives.length) * 100)
                      : 0}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">📈</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg Progress</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {objectives.length > 0 
                      ? Math.round(objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length)
                      : 0}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">🏢</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Departments</dt>
                  <dd className="text-lg font-medium text-gray-900">{departments.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Department Performance */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Department Performance
          </h3>
          <div className="space-y-4">
            {departments.map((department) => {
              const deptObjectives = objectives.filter(obj => obj.departmentId === department.id)
              const avgProgress = deptObjectives.length > 0 
                ? Math.round(deptObjectives.reduce((sum, obj) => sum + obj.progress, 0) / deptObjectives.length)
                : 0
              
              return (
                <div key={department.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900">{department.name}</h4>
                    <span className="text-sm text-gray-500">{avgProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div 
                      className={`h-2 rounded-full ${
                        avgProgress >= 75 ? 'bg-green-500' :
                        avgProgress >= 25 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${avgProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {deptObjectives.length} Objectives
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* OKR Level Distribution */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            OKR Level Distribution
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {objectives.filter(obj => obj.level === 'COMPANY').length}
              </div>
              <div className="text-sm text-gray-500">Company Level</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {objectives.filter(obj => obj.level === 'DEPARTMENT').length}
              </div>
              <div className="text-sm text-gray-500">Department Level</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {objectives.filter(obj => obj.level === 'INDIVIDUAL').length}
              </div>
              <div className="text-sm text-gray-500">Individual Level</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

