import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import NestedObjectivesList from '@/components/objectives/NestedObjectivesList'
import CreateCompanyObjectiveButton from '@/components/objectives/CreateCompanyObjectiveButton'

export default async function CompanyOKRsPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return null
  }

  // Only show company-level objectives
  const objectives = await prisma.objective.findMany({
    where: {
      level: 'COMPANY',
      status: 'ACTIVE'
    },
    include: {
      owner: {
        select: { id: true, name: true, avatar: true }
      },
      timeframe: true,
      department: {
        select: { id: true, name: true }
      },
      parentObjective: {
        select: { id: true, title: true, level: true }
      },
      childObjectives: {
        where: { status: 'ACTIVE' },
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          },
          department: {
            select: { id: true, name: true }
          },
          _count: {
            select: { keyResults: true, childObjectives: true }
          }
        },
        orderBy: { level: 'asc' }
      },
      keyResults: {
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          }
        }
      },
      _count: {
        select: { keyResults: true, childObjectives: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  })

  // Get available timeframes for filtering
  const timeframes = await prisma.timeframe.findMany({
    where: { isActive: true },
    orderBy: { startDate: 'desc' }
  })

  // Get all departments for filtering
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company OKRs</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage company-wide objectives and key results.
          </p>
        </div>
        {(session.user.role === 'ADMIN' || session.user.role === 'EXECUTIVE') && (
          <CreateCompanyObjectiveButton />
        )}
      </div>

      {/* Company OKR Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">O</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Company Objectives</dt>
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
                  <span className="text-white text-sm font-medium">KR</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Key Results</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {objectives.reduce((sum, obj) => sum + obj.keyResults.length, 0)}
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
                  <span className="text-white text-sm font-medium">%</span>
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
                  <span className="text-white text-sm font-medium">✓</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {objectives.filter(obj => obj.progress === 100).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <NestedObjectivesList 
        objectives={objectives}
        timeframes={timeframes}
        departments={departments}
        userRole={session.user.role}
        showCompanyOnly={true}
      />
    </div>
  )
}
