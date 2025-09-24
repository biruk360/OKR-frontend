'use client'

import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { cn, getProgressColor } from '@/lib/utils'
import { Target, Calendar, User, Building2 } from 'lucide-react'
import { ObjectiveWithRelations } from '@/types'

interface RecentObjectivesProps {
  objectives: ObjectiveWithRelations[]
}

export default function RecentObjectives({ objectives }: RecentObjectivesProps) {
  if (objectives.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Objectives</h3>
        <div className="text-center py-8">
          <Target className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No objectives yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first objective.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard/objectives/create"
              className="btn-primary"
            >
              Create Objective
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Recent Objectives</h3>
        <Link
          href="/dashboard/objectives"
          className="text-sm text-primary-600 hover:text-primary-500"
        >
          View all
        </Link>
      </div>
      
      <div className="space-y-4">
        {objectives.map((objective) => (
          <div
            key={objective.id}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/objectives/${objective.id}`}
                  className="text-sm font-medium text-gray-900 hover:text-primary-600 truncate block"
                >
                  {objective.title}
                </Link>
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {objective.description}
                </p>
                
                <div className="flex items-center mt-2 space-x-4 text-xs text-gray-500">
                  <div className="flex items-center">
                    <User className="h-3 w-3 mr-1" />
                    {objective.owner.name}
                  </div>
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    {objective.timeframe.name}
                  </div>
                  {objective.department && (
                    <div className="flex items-center">
                      <Building2 className="h-3 w-3 mr-1" />
                      {objective.department.name}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="ml-4 flex-shrink-0">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {Math.round(objective.progress)}%
                  </div>
                  <div className="w-16 bg-gray-200 rounded-full h-2 mt-1">
                    <div
                      className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        getProgressColor(objective.progress).split(' ')[0].replace('text-', 'bg-')
                      )}
                      style={{ width: `${Math.min(objective.progress, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>
                {objective._count?.keyResults || 0} Key Results
              </span>
              <span>
                Updated {formatDate(objective.updatedAt, 'MMM dd')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
