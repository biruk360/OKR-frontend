import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function ReportsPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return null
  }

  // Get report data based on user role
  const timeframes = await prisma.timeframe.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' }
  })

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  })

  // Get objectives for reporting
  let objectives: any[] = []
  if (session.user.role === 'EMPLOYEE') {
    objectives = await prisma.objective.findMany({
      where: {
        ownerId: session.user.id,
        status: 'ACTIVE'
      },
      include: {
        keyResults: true,
        timeframe: true
      }
    })
  } else {
    objectives = await prisma.objective.findMany({
      where: { status: 'ACTIVE' },
      include: {
        keyResults: true,
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        owner: {
          select: { id: true, name: true }
        }
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate and view OKR reports and analytics.
        </p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                  <dt className="text-sm font-medium text-gray-500 truncate">Progress Report</dt>
                  <dd className="text-sm text-gray-900">Overall progress summary</dd>
                </dl>
              </div>
            </div>
            <div className="mt-3">
              <button className="text-sm text-blue-600 hover:text-blue-500">
                Generate Report →
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">📈</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Performance Report</dt>
                  <dd className="text-sm text-gray-900">Individual/team performance</dd>
                </dl>
              </div>
            </div>
            <div className="mt-3">
              <button className="text-sm text-green-600 hover:text-green-500">
                Generate Report →
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">📋</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Alignment Report</dt>
                  <dd className="text-sm text-gray-900">OKR alignment analysis</dd>
                </dl>
              </div>
            </div>
            <div className="mt-3">
              <button className="text-sm text-purple-600 hover:text-purple-500">
                Generate Report →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Quick Statistics
          </h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{objectives.length}</div>
              <div className="text-sm text-gray-500">Total Objectives</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {objectives.reduce((sum, obj) => sum + obj.keyResults.length, 0)}
              </div>
              <div className="text-sm text-gray-500">Key Results</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {objectives.length > 0 
                  ? Math.round(objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length)
                  : 0}%
              </div>
              <div className="text-sm text-gray-500">Avg Progress</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">
                {objectives.filter(obj => obj.progress === 100).length}
              </div>
              <div className="text-sm text-gray-500">Completed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Export Data
          </h3>
          <div className="flex space-x-4">
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              Export to CSV
            </button>
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              Export to PDF
            </button>
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              Export to Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

