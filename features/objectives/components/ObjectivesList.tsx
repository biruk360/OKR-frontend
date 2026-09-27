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
import { pickCurrentTimeframe } from '@/lib/timeframe-utils'
import { EmptyState, FilterSelect } from '@/components/ui'

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
  const [filters, setFilters] = useState(() => ({
    level: '',
    timeframe: pickCurrentTimeframe(timeframes || [])?.id || '',
    department: '',
    search: ''
  }))

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
        return 'bg-muted text-foreground'
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
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Search</label>
            <input
              type="text"
              placeholder="Search objectives..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input"
            />
          </div>
          
          <div className="flex items-end">
            <FilterSelect
              label="Level"
              className="w-full"
              value={filters.level || undefined}
              onValueChange={(v) => setFilters({ ...filters, level: v ?? '' })}
              placeholder="All Levels"
              options={[
                { value: 'COMPANY', label: 'Company' },
                { value: 'DEPARTMENT', label: 'Department' },
                { value: 'INDIVIDUAL', label: 'Individual' },
              ]}
            />
          </div>

          <div className="flex items-end">
            <FilterSelect
              label="Timeframe"
              className="w-full"
              value={filters.timeframe || undefined}
              onValueChange={(v) => setFilters({ ...filters, timeframe: v ?? '' })}
              placeholder="All Timeframes"
              options={timeframes.map((timeframe) => {
                const typeLabel = timeframe.type === 'MONTHLY' ? 'Monthly' :
                                 timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                                 timeframe.type === 'SIX_MONTH' ? '6-Month' :
                                 timeframe.type === 'YEARLY' ? 'Yearly' : 'Quarterly'
                return { value: timeframe.id, label: `${timeframe.name} (${typeLabel})` }
              })}
            />
          </div>

          {departments.length > 0 && (
            <div className="flex items-end">
              <FilterSelect
                label="Department"
                className="w-full"
                value={filters.department || undefined}
                onValueChange={(v) => setFilters({ ...filters, department: v ?? '' })}
                placeholder="All Departments"
                options={departments.map((department) => ({ value: department.id, label: department.name }))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Objectives List */}
      {filteredObjectives.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No objectives found"
          description={
            objectives.length === 0
              ? 'Get started by creating your first objective.'
              : 'Try adjusting your filters to see more results.'
          }
        />
      ) : (
        <div className="grid gap-4">
          {filteredObjectives.map((objective) => (
            <div
              key={objective.id}
              className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow"
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
                          className="inline-flex items-center text-xs text-primary-600 hover:text-primary-800 hover:underline"
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
                    className="text-lg font-semibold text-foreground hover:text-primary-600 block"
                  >
                    {objective.title}
                  </Link>

                  {objective.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {objective.description}
                    </p>
                  )}

                  {objective.parentObjective && (
                    <div className="mt-2 p-2 bg-primary-50 border border-primary-200 rounded-md">
                      <div className="flex items-center">
                        <LinkIcon className="h-3 w-3 text-primary-600 mr-1" />
                        <span className="text-xs text-primary-700">
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
                    <div className="flex items-center bg-muted px-2 py-1 rounded-md border border-border">
                      {objective.owner.avatar ? (
                        <img 
                          src={objective.owner.avatar} 
                          alt={objective.owner.name}
                          className="h-5 w-5 rounded-full mr-2"
                        />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-primary-500 flex items-center justify-center mr-2">
                          <User className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      <span className="font-medium text-muted-foreground">{objective.owner.name}</span>
                    </div>
                    <div className="flex items-center text-muted-foreground">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>{objective.timeframe.name}</span>
                      {objective.timeframe.type && (
                        <span className="ml-1 text-xs bg-primary-100 text-primary-800 px-1.5 py-0.5 rounded">
                          {objective.timeframe.type === 'MONTHLY' ? 'Monthly' :
                           objective.timeframe.type === 'QUARTERLY' ? 'Quarterly' :
                           objective.timeframe.type === 'SIX_MONTH' ? '6-Month' :
                           objective.timeframe.type === 'YEARLY' ? 'Yearly' : ''}
                        </span>
                      )}
                    </div>
                    {objective.department && (
                      <div className="flex items-center text-muted-foreground">
                        <Building2 className="h-4 w-4 mr-1" />
                        {objective.department.name}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>{objective._count?.keyResults || 0} Key Results</span>
                      {objective._count?.childObjectives > 0 && (
                        <span>{objective._count.childObjectives} Child Objectives</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Updated {formatDate(objective.updatedAt, 'MMM dd')}
                    </div>
                  </div>
                </div>

                <div className="ml-6 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-lg font-semibold text-foreground">
                      {Math.round(objective.progress)}%
                    </div>
                    <div className="w-24 bg-surface-muted rounded-full h-2 mt-1">
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
