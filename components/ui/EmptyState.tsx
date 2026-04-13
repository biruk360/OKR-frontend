'use client'

import { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** When true, renders without the bordered card container (for use inside existing cards). */
  bare?: boolean
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  bare = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'text-center py-12 px-6',
        !bare && 'bg-white rounded-lg border border-gray-200',
        className
      )}
    >
      {Icon && (
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Icon className="h-6 w-6 text-gray-400" />
          </div>
        </div>
      )}
      <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mx-auto">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export default EmptyState
