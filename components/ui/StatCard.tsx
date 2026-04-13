'use client'

import { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatCardTone =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'red'
  | 'purple'
  | 'gray'
  | 'indigo'

const toneClasses: Record<StatCardTone, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
  gray: 'bg-gray-500',
  indigo: 'bg-indigo-500',
}

export interface StatCardProps {
  label: string
  value: ReactNode
  /** Lucide icon for the colored badge */
  icon?: LucideIcon
  /** Short text fallback for the icon badge (e.g. "O", "KR") */
  iconText?: string
  tone?: StatCardTone
  trend?: {
    value: string | number
    direction: 'up' | 'down' | 'neutral'
  }
  helperText?: string
  onClick?: () => void
  className?: string
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconText,
  tone = 'blue',
  trend,
  helperText,
  onClick,
  className,
}: StatCardProps) {
  const trendColor =
    trend?.direction === 'up'
      ? 'text-green-600'
      : trend?.direction === 'down'
      ? 'text-red-600'
      : 'text-gray-500'

  return (
    <div
      className={cn(
        'bg-white overflow-hidden shadow rounded-lg',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div
              className={cn(
                'w-8 h-8 rounded-md flex items-center justify-center',
                toneClasses[tone]
              )}
            >
              {Icon ? (
                <Icon className="h-5 w-5 text-white" />
              ) : (
                <span className="text-white text-sm font-medium">
                  {iconText ?? label.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{label}</dt>
              <dd className="text-lg font-medium text-gray-900">{value}</dd>
            </dl>
          </div>
        </div>
        {(trend || helperText) && (
          <div className="mt-3 flex items-center justify-between text-xs">
            {trend && (
              <span className={cn('font-medium', trendColor)}>
                {trend.direction === 'up' && '▲ '}
                {trend.direction === 'down' && '▼ '}
                {trend.value}
              </span>
            )}
            {helperText && <span className="text-gray-500">{helperText}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

export default StatCard
