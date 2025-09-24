import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OKRHierarchy from '@/components/hierarchy/OKRHierarchy'
import { Target, Users, TrendingUp, AlertCircle } from 'lucide-react'

async function getObjectivesWithHierarchy(timeframeId: string) {
  const objectives = await prisma.objective.findMany({
    where: {
      timeframeId,
      status: 'ACTIVE',
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          avatar: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
        },
      },
      parentObjective: {
        select: {
          id: true,
          title: true,
          level: true,
        },
      },
      childObjectives: {
        where: {
          status: 'ACTIVE',
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              keyResults: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      },
      keyResults: {
        where: {
          status: 'ACTIVE',
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      _count: {
        select: {
          keyResults: true,
          childObjectives: true,
        },
      },
    },
    orderBy: [
      { level: 'asc' }, // COMPANY first, then DEPARTMENT, then INDIVIDUAL
      { createdAt: 'desc' },
    ],
  })

  return objectives
}

async function getCurrentTimeframe() {
  const now = new Date()
  const timeframe = await prisma.timeframe.findFirst({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: {
      startDate: 'desc',
    },
  })

  return timeframe
}

async function getHierarchyStats(objectives: any[]) {
  const companyObjectives = objectives.filter(obj => obj.level === 'COMPANY')
  const departmentObjectives = objectives.filter(obj => obj.level === 'DEPARTMENT')
  const individualObjectives = objectives.filter(obj => obj.level === 'INDIVIDUAL')
  
  const alignedObjectives = objectives.filter(obj => obj.parentObjectiveId)
  const unalignedObjectives = objectives.filter(obj => !obj.parentObjectiveId)
  
  const avgProgress = objectives.length > 0 
    ? objectives.reduce((sum, obj) => sum + obj.progress, 0) / objectives.length 
    : 0

  return {
    total: objectives.length,
    company: companyObjectives.length,
    department: departmentObjectives.length,
    individual: individualObjectives.length,
    aligned: alignedObjectives.length,
    unaligned: unalignedObjectives.length,
    avgProgress: Math.round(avgProgress),
  }
}

export default async function AlignmentMapPage() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user) {
    redirect('/auth/signin')
  }

  const currentTimeframe = await getCurrentTimeframe()
  
  if (!currentTimeframe) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No Active Timeframe</h3>
            <p className="mt-1 text-sm text-gray-500">
              Please create an active timeframe to view the OKR hierarchy.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const objectives = await getObjectivesWithHierarchy(currentTimeframe.id)
  const stats = await getHierarchyStats(objectives)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">OKR Hierarchy</h1>
              <p className="mt-2 text-gray-600">
                Visualize how strategic company objectives cascade down into department and individual contributions with their Key Results
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Timeframe: {currentTimeframe.name} ({currentTimeframe.startDate.toLocaleDateString()} - {currentTimeframe.endDate.toLocaleDateString()})
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Target className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Objectives
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.total}
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
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Aligned Objectives
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.aligned}
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
                  <AlertCircle className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Unaligned Objectives
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.unaligned}
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
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Average Progress
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.avgProgress}%
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hierarchy Visualization */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">OKR Hierarchy</h2>
            <p className="text-sm text-gray-600">
              Click the "KR" toggle buttons to show/hide Key Results. Click expand/collapse icons to show/hide child objectives. Use mouse wheel to zoom and drag to pan.
            </p>
          </div>
          
          <Suspense fallback={
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          }>
            <OKRHierarchy objectives={objectives} currentTimeframeId={currentTimeframe.id} />
          </Suspense>
        </div>

        {/* Legend */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Legend</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Company Objectives</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Department Objectives</span>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
              <span className="text-sm text-gray-700">Individual Objectives</span>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p><strong>Progress Colors:</strong> Green (75%+), Yellow (25-74%), Red (&lt;25%)</p>
            <p><strong>Interactions:</strong> Click expand/collapse icons to show/hide child objectives. Drag to pan, scroll to zoom.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
