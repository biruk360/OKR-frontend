'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'

interface KeyResultNodeData {
  id: string
  title: string
  currentValue: number
  targetValue: number
  unit: string
  progress: number
  owner: {
    id: string
    name: string
    avatar?: string
  }
}

const KeyResultNode = memo(({ data, selected }: NodeProps<KeyResultNodeData>) => {
  const { 
    title, 
    currentValue, 
    targetValue, 
    unit, 
    progress, 
    owner 
  } = data

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return 'bg-green-500'
    if (progress >= 25) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const formatValue = (value: number, unit: string) => {
    if (unit === '%') {
      return `${Math.round(value)}%`
    }
    if (unit === 'NPS') {
      return `${Math.round(value)} NPS`
    }
    if (unit === 'Signups' || unit === 'Users' || unit === 'Customers') {
      return `${Math.round(value)} ${unit}`
    }
    if (unit === 'Revenue' || unit === 'Sales') {
      return `$${Math.round(value).toLocaleString()}`
    }
    return `${Math.round(value)} ${unit}`
  }

  return (
    <div className={`px-4 py-3 bg-muted border-2 rounded-lg shadow-md min-w-[240px] max-w-[280px] ${
      selected ? 'border-blue-500' : 'border-border'
    }`}>
      {/* Title */}
      <h4 className="font-medium text-foreground text-sm mb-3 line-clamp-2">
        {title}
      </h4>

      {/* Progress Bar with Value */}
      <div className="mb-2">
        <div className="w-full bg-gray-200 rounded-full h-4 relative">
          <div
            className={`h-4 rounded-full transition-all duration-300 ${getProgressColor(progress)}`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-foreground">
              {formatValue(currentValue, unit)}
            </span>
          </div>
        </div>
      </div>

      {/* Target Value */}
      <div className="text-xs text-muted-foreground text-center">
        Target: {formatValue(targetValue, unit)}
      </div>

      {/* Handles for connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 bg-gray-400"
      />
    </div>
  )
})

KeyResultNode.displayName = 'KeyResultNode'

export default KeyResultNode






