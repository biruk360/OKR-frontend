'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatDate, getProgressColor } from '@/lib/utils'
import { 
  Target, 
  Calendar, 
  User, 
  Building2, 
  Link as LinkIcon,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { ObjectiveWithRelations } from '@/types'
import EditObjectiveButton from './EditObjectiveButton'
import ArchiveObjectiveButton from './ArchiveObjectiveButton'
import UnarchiveObjectiveButton from './UnarchiveObjectiveButton'
import DeleteObjectiveButton from './DeleteObjectiveButton'
import CloneObjectiveButton from './CloneObjectiveButton'

interface NestedObjectivesListProps {
  objectives: any[]
  timeframes: any[]
  departments: any[]
  userRole: string
  showPersonalOnly?: boolean
  showCompanyOnly?: boolean
  showDepartmentOnly?: boolean
}

interface ObjectiveNode {
  objective: any
  children: ObjectiveNode[]
  level: number // 0 = Company, 1 = Department, 2 = Individual
}

export default function NestedObjectivesList({ 
  objectives, 
  timeframes, 
  departments, 
  userRole,
  showPersonalOnly = false,
  showCompanyOnly = false,
  showDepartmentOnly = false
}: NestedObjectivesListProps) {
  const [expandedObjectives, setExpandedObjectives] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState({
    level: '',
    timeframe: '',
    department: '',
    search: ''
  })

  // Build hierarchical tree structure
  const objectiveTree = useMemo(() => {
    // First, filter objectives based on filters
    let filtered = objectives.filter(objective => {
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

    // Create a map of all objectives by ID
    const objectiveMap = new Map<string, any>()
    filtered.forEach(obj => {
      objectiveMap.set(obj.id, obj)
    })

    // Build parent-child relationships
    const childrenMap = new Map<string, any[]>()
    filtered.forEach(obj => {
      if (obj.parentObjectiveId) {
        if (!childrenMap.has(obj.parentObjectiveId)) {
          childrenMap.set(obj.parentObjectiveId, [])
        }
        childrenMap.get(obj.parentObjectiveId)!.push(obj)
      }
    })

    // Find root objectives (Company level or objectives without parents)
    const rootObjectives = filtered.filter(obj => 
      obj.level === 'COMPANY' || !obj.parentObjectiveId
    )

    // Build tree recursively
    const buildTree = (objective: any, level: number): ObjectiveNode => {
      const children = childrenMap.get(objective.id) || []
      return {
        objective,
        level,
        children: children
          .sort((a, b) => {
            // Sort by level: COMPANY first, then DEPARTMENT, then INDIVIDUAL
            const levelOrder = { 'COMPANY': 0, 'DEPARTMENT': 1, 'INDIVIDUAL': 2 }
            return (levelOrder[a.level as keyof typeof levelOrder] || 3) - 
                   (levelOrder[b.level as keyof typeof levelOrder] || 3)
          })
          .map(child => buildTree(child, level + 1))
      }
    }

    return rootObjectives
      .sort((a, b) => {
        // Sort root objectives by level
        const levelOrder = { 'COMPANY': 0, 'DEPARTMENT': 1, 'INDIVIDUAL': 2 }
        return (levelOrder[a.level as keyof typeof levelOrder] || 3) - 
               (levelOrder[b.level as keyof typeof levelOrder] || 3)
      })
      .map(obj => buildTree(obj, 0))
  }, [objectives, filters])

  const toggleExpand = (objectiveId: string) => {
    setExpandedObjectives(prev => {
      const newSet = new Set(prev)
      if (newSet.has(objectiveId)) {
        newSet.delete(objectiveId)
      } else {
        newSet.add(objectiveId)
      }
      return newSet
    })
  }

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
        return <Building2 className="h-4 w-4" />
      case 'INDIVIDUAL':
        return <User className="h-4 w-4" />
      default:
        return <Target className="h-4 w-4" />
    }
  }

  const renderObjectiveCard = (node: ObjectiveNode) => {
    const { objective, level, children } = node
    const isExpanded = expandedObjectives.has(objective.id)
    const hasChildren = children.length > 0
    const indentLevel = level * 24 // 24px per level

    return (
      <div key={objective.id} className="relative">
        {/* Objective Card */}
        <div
          className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow mb-2"
          style={{ marginLeft: `${indentLevel}px` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {/* Expand/Collapse Button */}
                  {hasChildren && (
                    <button
                      onClick={() => toggleExpand(objective.id)}
                      className="p-1 hover:bg-muted rounded transition-colors"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  )}
                  {!hasChildren && <div className="w-6" />} {/* Spacer for alignment */}

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
                className="text-lg font-semibold text-foreground hover:text-primary-600 block"
              >
                {objective.title}
              </Link>

              {objective.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {objective.description}
                </p>
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
                    <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center mr-2">
                      <User className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <span className="font-medium text-muted-foreground">{objective.owner.name}</span>
                </div>
                <div className="flex items-center text-muted-foreground">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>{objective.timeframe.name}</span>
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

        {/* Render children if expanded */}
        {hasChildren && isExpanded && (
          <div className="mt-2">
            {children.map(child => renderObjectiveCard(child))}
          </div>
        )}
      </div>
    )
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
          
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Level</label>
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
            <label className="block text-sm font-medium text-muted-foreground mb-1">Timeframe</label>
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">Department</label>
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

      {/* Nested Objectives Tree */}
      {objectiveTree.length === 0 ? (
        <div className="text-center py-12">
          <Target className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No objectives found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {objectives.length === 0 
              ? "Get started by creating your first objective."
              : "Try adjusting your filters to see more results."
            }
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {objectiveTree.map(node => renderObjectiveCard(node))}
        </div>
      )}
    </div>
  )
}

