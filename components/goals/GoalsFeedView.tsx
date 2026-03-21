'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { User, Calendar, Building2, Target, MessageSquare, TrendingUp } from 'lucide-react'

interface GoalsFeedViewProps {
  objectives: any[]
  onRefresh: () => void
}

export default function GoalsFeedView({ objectives, onRefresh }: GoalsFeedViewProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ON_TRACK':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'AT_RISK':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'OFF_TRACK':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
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
    <div className="space-y-4">
      {objectives.map((objective) => (
        <div
          key={objective.id}
          className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              {objective.owner.avatar ? (
                <img
                  src={objective.owner.avatar}
                  alt={objective.owner.name}
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center">
                  <User className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/dashboard/objectives/${objective.id}`}
                    className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                  >
                    {objective.title}
                  </Link>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(objective.goalStatus || objective.status || 'NO_STATUS')}`}>
                    {getStatusLabel(objective.goalStatus || objective.status || 'NO_STATUS')}
                  </span>
                </div>
                <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                  <span>{objective.owner.name}</span>
                  {objective.department && (
                    <>
                      <span>•</span>
                      <span className="flex items-center">
                        <Building2 className="h-3 w-3 mr-1" />
                        {objective.department.name}
                      </span>
                    </>
                  )}
                  {objective.endDate && (
                    <>
                      <span>•</span>
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDate(objective.endDate, 'MMM dd, yyyy')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          {objective.description && (
            <p className="text-sm text-gray-700 mb-4 line-clamp-3">
              {objective.description}
            </p>
          )}

          {/* Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm font-semibold text-gray-900">{Math.round(objective.progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(objective.progress, 100)}%` }}
              />
            </div>
          </div>

          {/* Key Results Count */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <Target className="h-4 w-4 mr-1" />
                {objective._count?.keyResults || 0} Key Results
              </span>
              {objective._count?.childObjectives > 0 && (
                <span className="flex items-center">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  {objective._count.childObjectives} Child Objectives
                </span>
              )}
            </div>
            <span className="text-xs">
              Updated {formatDate(objective.updatedAt, 'MMM dd')}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

