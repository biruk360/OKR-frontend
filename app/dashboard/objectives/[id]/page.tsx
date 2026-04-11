import { getServerSessionSafe } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveParams } from '@/lib/resolve-route-params'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Target, User, Calendar, Building2, Archive } from 'lucide-react'
import EditObjectiveButton from '@/components/objectives/EditObjectiveButton'
import ArchiveObjectiveButton from '@/components/objectives/ArchiveObjectiveButton'
import UnarchiveObjectiveButton from '@/components/objectives/UnarchiveObjectiveButton'
import DeleteObjectiveButton from '@/components/objectives/DeleteObjectiveButton'
import CloneObjectiveButton from '@/components/objectives/CloneObjectiveButton'
import KeyResultsList from '@/components/keyresults/KeyResultsList'
import { PageTitleSetter } from '@/components/layout/DashboardTitleContext'
import AlignsToParentBadge from '@/components/objectives/AlignsToParentBadge'
import { ActivityLogPanel } from '@/components/shared/ActivityLogPanel'

interface ObjectiveDetailPageProps {
  params: { id: string } | Promise<{ id: string }>
}

export default async function ObjectiveDetailPage({ params }: ObjectiveDetailPageProps) {
  const session = await getServerSessionSafe()
  
  if (!session) {
    redirect('/auth/signin')
  }

  const { id } = await resolveParams(params)
  if (!id) {
    notFound()
  }

  const objective = await prisma.objective.findUnique({
    where: { id },
    include: {
      owner: {
        select: { id: true, name: true, avatar: true, email: true }
      },
      timeframe: true,
      department: {
        select: { id: true, name: true }
      },
      parentObjective: {
        select: { id: true, title: true, level: true, goalStatus: true, progress: true }
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
            select: { keyResults: true }
          }
        },
        orderBy: { updatedAt: 'desc' }
      },
      keyResults: {
        include: {
          owner: {
            select: { id: true, name: true, avatar: true }
          }
        },
        orderBy: [
          { status: 'asc' }, // ACTIVE first, then ARCHIVED
          { createdAt: 'desc' }
        ]
      },
      _count: {
        select: { keyResults: true, childObjectives: true }
      }
    }
  })

  if (!objective) {
    notFound()
  }

  // Fetch timeframes for clone functionality
  const timeframes = await prisma.timeframe.findMany({
    orderBy: { startDate: 'desc' }
  })

  // Fetch users for key result creation
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' }
  })

  return (
    <>
      <PageTitleSetter title={objective.title} />
      <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/objectives"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Objectives
          </Link>
        </div>
        <div className="flex items-center space-x-2">
          {objective.status === 'ARCHIVED' ? (
            <>
              <UnarchiveObjectiveButton objective={objective} className="px-3 py-2" />
              <DeleteObjectiveButton objective={objective} className="px-3 py-2" />
            </>
          ) : (
            <>
              <CloneObjectiveButton objective={objective} timeframes={timeframes} className="px-3 py-2" />
              <EditObjectiveButton objective={objective} className="px-3 py-2" />
              <ArchiveObjectiveButton objective={objective} className="px-3 py-2" />
              <DeleteObjectiveButton objective={objective} className="px-3 py-2" />
            </>
          )}
        </div>
      </div>

      {/* Objective Details */}
      <div className="bg-white shadow rounded-lg">
        {objective.status === 'ARCHIVED' && (
          <div className="bg-orange-50 border-b border-orange-200 px-6 py-3">
            <div className="flex items-center">
              <Archive className="h-5 w-5 text-orange-600 mr-2" />
              <span className="text-sm font-medium text-orange-800">
                This objective has been archived
              </span>
            </div>
          </div>
        )}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  objective.level === 'COMPANY' ? 'bg-blue-100 text-blue-800' :
                  objective.level === 'DEPARTMENT' ? 'bg-green-100 text-green-800' :
                  'bg-purple-100 text-purple-800'
                }`}>
                  <Target className="h-4 w-4 mr-1" />
                  {objective.level}
                </span>
              </div>

              <p className="text-lg font-semibold text-gray-900">{objective.title}</p>

              {objective.parentObjective && (
                <div className="mt-2">
                  <AlignsToParentBadge
                    parent={{
                      id: objective.parentObjective.id,
                      title: objective.parentObjective.title,
                      progress: objective.parentObjective.progress,
                      goalStatus: objective.parentObjective.goalStatus,
                    }}
                  />
                </div>
              )}
              
              {objective.description && (
                <p className="mt-2 text-gray-600">{objective.description}</p>
              )}
            </div>
            
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">
                {Math.round(objective.progress)}%
              </div>
              <div className="w-32 bg-gray-200 rounded-full h-3 mt-2">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    objective.progress >= 75 ? 'bg-green-500' :
                    objective.progress >= 25 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(objective.progress, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center text-sm text-gray-500 mb-2">
                <User className="h-4 w-4 mr-2" />
                Owner
              </div>
              <div className="flex items-center space-x-3">
                {objective.owner.avatar ? (
                  <img 
                    src={objective.owner.avatar} 
                    alt={objective.owner.name}
                    className="h-10 w-10 rounded-full border-2 border-gray-200"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center border-2 border-gray-200">
                    <User className="h-6 w-6 text-white" />
                  </div>
                )}
                <div>
                  <div className="font-medium text-gray-900">{objective.owner.name}</div>
                  <div className="text-sm text-gray-500">{objective.owner.email}</div>
                </div>
              </div>
            </div>
            
            <div>
              <div className="flex items-center text-sm text-gray-500 mb-1">
                <Calendar className="h-4 w-4 mr-2" />
                Timeframe
              </div>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">{objective.timeframe.name}</span>
                {objective.timeframe.type && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {objective.timeframe.type === 'MONTHLY' ? 'Monthly' :
                     objective.timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                     objective.timeframe.type === 'SIX_MONTH' ? '6-Month' :
                     objective.timeframe.type === 'YEARLY' ? 'Yearly' : ''}
                  </span>
                )}
              </div>
            </div>
            
            {objective.department && (
              <div>
                <div className="flex items-center text-sm text-gray-500 mb-1">
                  <Building2 className="h-4 w-4 mr-2" />
                  Department
                </div>
                <div className="font-medium text-gray-900">{objective.department.name}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Child Objectives (Contributing Objectives) */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Contributing Objectives {objective.childObjectives.length > 0 && `(${objective.childObjectives.length})`}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {objective.childObjectives.length > 0 
              ? "Department and individual objectives that contribute to this objective"
              : "No objectives are currently aligned to this objective"
            }
          </p>
        </div>
        
        {objective.childObjectives.length > 0 ? (
          
          <div className="px-6 py-4">
            <div className="space-y-4">
              {objective.childObjectives.map((child) => (
                <div key={child.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          child.level === 'DEPARTMENT' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {child.level}
                        </span>
                        {child.department && (
                          <span className="text-xs text-gray-500">{child.department.name}</span>
                        )}
                      </div>
                      
                      <Link
                        href={`/dashboard/objectives/${child.id}`}
                        className="text-lg font-medium text-gray-900 hover:text-blue-600 block"
                      >
                        {child.title}
                      </Link>
                      
                      <div className="mt-2 flex items-center space-x-4 text-sm">
                        <div className="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-200">
                          {child.owner.avatar ? (
                            <img 
                              src={child.owner.avatar} 
                              alt={child.owner.name}
                              className="h-4 w-4 rounded-full mr-1.5"
                            />
                          ) : (
                            <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center mr-1.5">
                              <User className="h-2.5 w-2.5 text-white" />
                            </div>
                          )}
                          <span className="font-medium text-gray-700">{child.owner.name}</span>
                        </div>
                        <div className="flex items-center text-gray-500">
                          <Target className="h-4 w-4 mr-1" />
                          {child._count.keyResults} Key Results
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {Math.round(child.progress)}%
                      </div>
                      <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            child.progress >= 75 ? 'bg-green-500' :
                            child.progress >= 25 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(child.progress, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-6 py-8 text-center">
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-gray-900 mb-2">No contributing objectives</h3>
            <p className="text-sm text-gray-500">
              No department or individual objectives are currently aligned to this objective.
            </p>
          </div>
        )}
      </div>

      {/* Key Results */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Key Results ({objective.keyResults.length})
          </h2>
        </div>
        
        <div className="px-6 py-4">
        <KeyResultsList
          keyResults={objective.keyResults}
          objectiveId={objective.id}
          objective={objective}
          users={users}
        />
        </div>
      </div>

      <ActivityLogPanel entityType="objective" entityId={objective.id} />
    </div>
    </>
  )
}
