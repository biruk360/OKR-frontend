import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function ProgressTrackingPage() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    return null
  }

  // Get progress data based on user role
  let objectives: any[] = []
  
  if (session.user.role === 'EMPLOYEE') {
    objectives = await prisma.objective.findMany({
      where: {
        ownerId: session.user.id,
        status: 'ACTIVE'
      },
      include: {
        keyResults: {
          include: {
            todos: true
          }
        },
        timeframe: true
      },
      orderBy: { updatedAt: 'desc' }
    })
  } else if (session.user.role === 'DEPARTMENT_LEAD') {
    const userDepartments = await prisma.departmentMembership.findMany({
      where: { userId: session.user.id },
      select: { departmentId: true }
    })
    const departmentIds = userDepartments.map(d => d.departmentId)
    
    objectives = await prisma.objective.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { ownerId: session.user.id },
          { departmentId: { in: departmentIds } }
        ]
      },
      include: {
        keyResults: {
          include: {
            todos: true
          }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
  } else {
    // Admin or Executive - see all objectives
    objectives = await prisma.objective.findMany({
      where: {
        status: 'ACTIVE'
      },
      include: {
        keyResults: {
          include: {
            todos: true
          }
        },
        timeframe: true,
        department: {
          select: { id: true, name: true }
        },
        owner: {
          select: { id: true, name: true, avatar: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Progress Tracking</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor progress across all your objectives and key results.
        </p>
      </div>

      {/* Progress Overview Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">✓</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">On Track</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {objectives.filter(obj => obj.progress >= 75).length}
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
                  <span className="text-white text-sm font-medium">⚠</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">At Risk</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {objectives.filter(obj => obj.progress >= 25 && obj.progress < 75).length}
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
                <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                  <span className="text-white text-sm font-medium">✗</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Off Track</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {objectives.filter(obj => obj.progress < 25).length}
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
                <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
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
      </div>

      {/* Detailed Progress List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Detailed Progress
          </h3>
          <div className="space-y-4">
            {objectives.map((objective) => (
              <div key={objective.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-900">{objective.title}</h4>
                  <span className="text-sm text-gray-500">{objective.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full ${
                      objective.progress >= 75 ? 'bg-green-500' :
                      objective.progress >= 25 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${objective.progress}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-500">
                  {objective.keyResults.length} Key Results • {objective.timeframe.name}
                  {objective.department && ` • ${objective.department.name}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

