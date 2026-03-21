'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate, getProgressColor } from '@/lib/utils'
import { 
  Target, 
  Calendar, 
  User, 
  Building2, 
  Link as LinkIcon,
  MoreHorizontal,
  Edit,
  Archive,
  Trash2
} from 'lucide-react'
import { ObjectiveWithRelations } from '@/types'
import EditObjectiveButton from './EditObjectiveButton'
import ArchiveObjectiveButton from './ArchiveObjectiveButton'
import UnarchiveObjectiveButton from './UnarchiveObjectiveButton'
import DeleteObjectiveButton from './DeleteObjectiveButton'
import CloneObjectiveButton from './CloneObjectiveButton'

interface ObjectivesListProps {
  objectives: any[] // More flexible type to handle partial user data
  timeframes: any[]
  departments: any[]
  userRole: string
  showPersonalOnly?: boolean
  showCompanyOnly?: boolean
  showDepartmentOnly?: boolean
}

export default function ObjectivesList({ 
  objectives, 
  timeframes, 
  departments, 
  userRole,
  showPersonalOnly = false,
  showCompanyOnly = false,
  showDepartmentOnly = false
}: ObjectivesListProps) {
  const [filters, setFilters] = useState({
    level: '',
    timeframe: '',
    department: '',
    search: ''
  })

  const filteredObjectives = objectives.filter(objective => {
    if (filters.level && objective.level !== filters.level) return false
    if (filters.timeframe && objective.timeframeId !== filters.timeframe) return false
    if (filters.department && objective.departmentId !== filters.department) return false
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      if (!objective.title.toLowerCase().includes(searchLower) && 
          !objective.description?.toLowerCase().includes(searchLower)) {
        return false
      }
    }
    return true
  })

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'COMPANY':
        return 'bg-primary-100 text-primary-800'
      case 'DEPARTMENT':
        return 'bg-warning-100 text-warning-800'
      case 'INDIVIDUAL':
        return 'bg-success-100 text-success-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'COMPANY':
        return <Building2 className="h-4 w-4" />
      case 'DEPARTMENT':
        return <User className="h-4 w-4" />
      case 'INDIVIDUAL':
        return <User className="h-4 w-4" />
      default:
        return <Target className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search objectives..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
            <select
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              className="input"
            >
              <option value="">All Levels</option>
              <option value="COMPANY">Company</option>
              <option value="DEPARTMENT">Department</option>
              <option value="INDIVIDUAL">Individual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe</label>
            <select
              value={filters.timeframe}
              onChange={(e) => setFilters({ ...filters, timeframe: e.target.value })}
              className="input"
            >
              <option value="">All Timeframes</option>
              {timeframes.map((timeframe) => {
                const typeLabel = timeframe.type === 'MONTHLY' ? 'Monthly' :
                                 timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                                 timeframe.type === 'SIX_MONTH' ? '6-Month' :
                                 timeframe.type === 'YEARLY' ? 'Yearly' : 'Quarterly'
                return (
                  <option key={timeframe.id} value={timeframe.id}>
                    {timeframe.name} ({typeLabel})
                  </option>
                )
              })}
            </select>
          </div>

          {departments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={filters.department}
                onChange={(e) => setFilters({ ...filters, department: e.target.value })}
                className="input"
              >
                <option value="">All Departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Objectives List */}
      {filteredObjectives.length === 0 ? (
        <div className="text-center py-12">
          <Target className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No objectives found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {objectives.length === 0 
              ? "Get started by creating your first objective."
              : "Try adjusting your filters to see more results."
            }
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredObjectives.map((objective) => (
            <div
              key={objective.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLevelColor(objective.level)}`}>
                        {getLevelIcon(objective.level)}
                        <span className="ml-1">{objective.level}</span>
                      </span>
                      
                      {objective.parentObjective && (
                        <Link
                          href={`/dashboard/objectives/${objective.parentObjective.id}`}
                          className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <LinkIcon className="h-3 w-3 mr-1" />
                          Aligned to: {objective.parentObjective.title}
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      {objective.status === 'ARCHIVED' ? (
                        <>
                          <UnarchiveObjectiveButton objective={objective} />
                          <DeleteObjectiveButton objective={objective} />
                        </>
                      ) : (
                        <>
                          <CloneObjectiveButton objective={objective} timeframes={timeframes} />
                          <EditObjectiveButton objective={objective} />
                          <ArchiveObjectiveButton objective={objective} />
                          <DeleteObjectiveButton objective={objective} />
                        </>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/objectives/${objective.id}`}
                    className="text-lg font-semibold text-gray-900 hover:text-primary-600 block"
                  >
                    {objective.title}
                  </Link>

                  {objective.description && (
                    <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                      {objective.description}
                    </p>
                  )}

                  {objective.parentObjective && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-center">
                        <LinkIcon className="h-3 w-3 text-blue-600 mr-1" />
                        <span className="text-xs text-blue-700">
                          Aligned to: 
                          <Link 
                            href={`/dashboard/objectives/${objective.parentObjective.id}`}
                            className="ml-1 font-medium hover:underline"
                          >
                            {objective.parentObjective.title}
                          </Link>
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex items-center space-x-4 text-sm">
                    <div className="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-200">
                      {objective.owner.avatar ? (
                        <img 
                          src={objective.owner.avatar} 
                          alt={objective.owner.name}
                          className="h-5 w-5 rounded-full mr-2"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center mr-2">
                          <User className="h-3 w-3 text-white" />
                        </div>
                      )}
                      <span className="font-medium text-gray-700">{objective.owner.name}</span>
                    </div>
                    <div className="flex items-center text-gray-500">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>{objective.timeframe.name}</span>
                      {objective.timeframe.type && (
                        <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                          {objective.timeframe.type === 'MONTHLY' ? 'Monthly' :
                           objective.timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                           objective.timeframe.type === 'SIX_MONTH' ? '6-Month' :
                           objective.timeframe.type === 'YEARLY' ? 'Yearly' : ''}
                        </span>
                      )}
                    </div>
                    {objective.department && (
                      <div className="flex items-center text-gray-500">
                        <Building2 className="h-4 w-4 mr-1" />
                        {objective.department.name}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{objective._count?.keyResults || 0} Key Results</span>
                      {objective._count?.childObjectives > 0 && (
                        <span>{objective._count.childObjectives} Child Objectives</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Updated {formatDate(objective.updatedAt, 'MMM dd')}
                    </div>
                  </div>
                </div>

                <div className="ml-6 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">
                      {Math.round(objective.progress)}%
                    </div>
                    <div className="w-24 bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          getProgressColor(objective.progress).split(' ')[0].replace('text-', 'bg-')
                        }`}
                        style={{ width: `${Math.min(objective.progress, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
