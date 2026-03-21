'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, User, Calendar } from 'lucide-react'
import { formatDate, getProgressColor } from '@/lib/utils'
import KeyResultsList from '@/components/keyresults/KeyResultsList'

interface GoalsTableProps {
  objectives: any[]
  onRefresh: () => void
  users: any[]
}

export default function GoalsTable({ objectives, onRefresh, users }: GoalsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (objectiveId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(objectiveId)) {
        newSet.delete(objectiveId)
      } else {
        newSet.add(objectiveId)
      }
      return newSet
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ON_TRACK':
        return 'bg-green-100 text-green-800'
      case 'AT_RISK':
        return 'bg-yellow-100 text-yellow-800'
      case 'OFF_TRACK':
        return 'bg-red-100 text-red-800'
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ON_TRACK':
        return 'On Track'
      case 'AT_RISK':
        return 'At Risk'
      case 'OFF_TRACK':
        return 'Off Track'
      case 'CLOSED':
        return 'Closed'
      default:
        return 'No Status'
    }
  }

  if (objectives.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-500">No goals found. Create your first goal to get started.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
              {/* Expand/Collapse column */}
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Owner
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Goal Title
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Labels
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Progress
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              End Date
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {objectives.map((objective) => {
            const isExpanded = expandedRows.has(objective.id)
            const keyResults = objective.keyResults ?? []

            return (
              <Fragment key={objective.id}>
                <tr className="hover:bg-gray-50">
                  {/* Expand/Collapse */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleRow(objective.id)}
                      className="text-gray-400 hover:text-gray-600"
                      title="Key results"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                  </td>

                  {/* Owner */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {objective.owner.avatar ? (
                        <img
                          src={objective.owner.avatar}
                          alt={objective.owner.name}
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                          <User className="h-4 w-4 text-white" />
                        </div>
                      )}
                      <span className="ml-2 text-sm text-gray-900">{objective.owner.name}</span>
                    </div>
                  </td>

                  {/* Goal Title */}
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/objectives/${objective.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600"
                    >
                      {objective.title}
                    </Link>
                    {objective.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                        {objective.description}
                      </p>
                    )}
                  </td>

                  {/* Labels */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {objective.objectiveLabels?.map((ol: any) => (
                        <span
                          key={ol.labelId}
                          className="px-2 py-1 text-xs font-medium rounded-full"
                          style={{
                            backgroundColor: `${ol.label.color}20`,
                            color: ol.label.color,
                            border: `1px solid ${ol.label.color}40`
                          }}
                        >
                          {ol.label.name}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Progress */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            getProgressColor(objective.progress).split(' ')[0].replace('text-', 'bg-')
                          }`}
                          style={{ width: `${Math.min(objective.progress, 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {Math.round(objective.progress)}%
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(objective.goalStatus || objective.status || 'NO_STATUS')}`}>
                      {getStatusLabel(objective.goalStatus || objective.status || 'NO_STATUS')}
                    </span>
                  </td>

                  {/* End Date */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {objective.endDate ? (
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        {formatDate(objective.endDate, 'MMM dd, yyyy')}
                      </div>
                    ) : objective.timeframe?.endDate ? (
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        {formatDate(objective.timeframe.endDate, 'MMM dd, yyyy')}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>

                {/* Expanded Key Results Row */}
                {isExpanded && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 bg-gray-50">
                      <div className="pl-8">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          Key Results ({keyResults.length})
                        </h4>
                        <KeyResultsList
                          keyResults={keyResults}
                          objectiveId={objective.id}
                          objective={objective}
                          users={users}
                          onKeyResultsChange={onRefresh}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

