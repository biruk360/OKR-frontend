'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Target, User, ChevronDown, ChevronRight } from 'lucide-react'

interface ObjectiveNodeData {
  id: string
  title: string
  description?: string
  level: 'COMPANY' | 'DEPARTMENT' | 'INDIVIDUAL'
  progress: number
  owner: {
    id: string
    name: string
    avatar?: string
  }
  department?: {
    id: string
    name: string
  }
  keyResultsCount: number
  childObjectivesCount: number
  isExpanded: boolean
  isKRExpanded: boolean
  onToggleExpand: (id: string) => void
  onToggleKR: (id: string) => void
}

const ObjectiveNode = memo(({ data, selected }: NodeProps<ObjectiveNodeData>) => {
  const { 
    title, 
    description, 
    level, 
    progress, 
    owner, 
    department, 
    keyResultsCount, 
    childObjectivesCount,
    isExpanded,
    isKRExpanded,
    onToggleExpand,
    onToggleKR
  } = data

  const getLevelName = (level: string) => {
    switch (level) {
      case 'COMPANY':
        return 'Company'
      case 'DEPARTMENT':
        return department?.name || 'Department'
      case 'INDIVIDUAL':
        return owner.name
      default:
        return 'Team'
    }
  }

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return 'bg-green-500'
    if (progress >= 25) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className={`px-6 py-4 bg-white border-2 rounded-lg shadow-lg min-w-[320px] max-w-[400px] ${
      selected ? 'border-blue-500' : 'border-gray-200'
    }`}>
      {/* Team/Level Name */}
      <div className="mb-3">
        <span className="text-sm font-medium text-gray-600">
          {getLevelName(level)}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-semibold text-gray-900 text-base mb-3 line-clamp-2">
        {title}
      </h3>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">Progress</span>
          <span className="text-sm font-medium text-gray-900">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(progress)}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* KR Toggle Button */}
      {keyResultsCount > 0 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => onToggleKR(data.id)}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors"
          >
            <span className="text-sm font-medium">KR {keyResultsCount}</span>
            {isKRExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          
          {/* Child Objectives Toggle */}
          {childObjectivesCount > 0 && (
            <button
              onClick={() => onToggleExpand(data.id)}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-600" />
              )}
            </button>
          )}
        </div>
      )}

      {/* Handles for connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-gray-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-gray-400"
        style={{ opacity: (childObjectivesCount > 0 || isKRExpanded) ? 1 : 0 }}
      />
    </div>
  )
})

ObjectiveNode.displayName = 'ObjectiveNode'

export default ObjectiveNode
