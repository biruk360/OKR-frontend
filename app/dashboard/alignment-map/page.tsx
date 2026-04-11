import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSessionSafe } from '@/lib/auth'
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
          todos: {
            select: {
              status: true,
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
      { level: 'asc' },
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
  const companyObjectives = objectives.filter((obj) => obj.level === 'COMPANY')
  const departmentObjectives = objectives.filter((obj) => obj.level === 'DEPARTMENT')
  const individualObjectives = objectives.filter((obj) => obj.level === 'INDIVIDUAL')

  const alignedObjectives = objectives.filter((obj) => obj.parentObjectiveId)
  const unalignedObjectives = objectives.filter((obj) => !obj.parentObjectiveId)

  const avgProgress =
    objectives.length > 0
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
  const session = await getServerSessionSafe()

  if (!session?.user) {
    redirect('/auth/signin')
  }

  const currentTimeframe = await getCurrentTimeframe()

  if (!currentTimeframe) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-gray-400" />
          <h2 className="mt-2 text-sm font-medium text-gray-900">No active timeframe</h2>
          <p className="mt-1 text-xs text-gray-500">
            Create an active timeframe to view the strategy map.
          </p>
        </div>
      </div>
    )
  }

  const objectives = await getObjectivesWithHierarchy(currentTimeframe.id)
  const stats = await getHierarchyStats(objectives)

  const brandingName = await prisma.systemSettings.findUnique({
    where: { key: 'branding_workspaceName' },
    select: { value: true },
  })
  const workspaceName =
    brandingName?.value?.trim() || process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'Company'

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
        <span className="font-medium text-gray-800">
          {currentTimeframe.name}
          <span className="font-normal text-gray-500">
            {' '}
            · {currentTimeframe.startDate.toLocaleDateString()} –{' '}
            {currentTimeframe.endDate.toLocaleDateString()}
          </span>
        </span>
        <span className="hidden sm:inline text-gray-300">|</span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-3.5 w-3.5 text-blue-600" />
          {stats.total} objectives
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-green-600" />
          {stats.aligned} aligned
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
          {stats.unaligned} unaligned
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5 text-purple-600" />
          {stats.avgProgress}% avg
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <Suspense
            fallback={
              <div className="flex h-64 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
              </div>
            }
          >
            <OKRHierarchy
              objectives={objectives}
              currentTimeframeId={currentTimeframe.id}
              timeframeName={currentTimeframe.name}
              workspaceName={workspaceName}
              layout="fullscreen"
            />
          </Suspense>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-1.5 text-[11px] leading-snug text-gray-600">
          <span className="font-medium text-gray-700">Legend:</span> Top = company (workspace); next row =
          company OKR plans; below = sub-OKRs aligned under each parent. Status pill = goal health (on track /
          at risk / behind). Configure strict progress roll-up (average/sum of child %) in Edit objective.
          Zoom/pan the canvas; use controls to fit.
        </div>
      </div>
    </div>
  )
}
