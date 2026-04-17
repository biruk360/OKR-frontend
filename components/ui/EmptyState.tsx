'use client'

import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
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
  const content = (
    <>
      {Icon && (
        <div className="flex justify-center mb-4">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center">
            <Icon className="size-6 text-muted-foreground" />
          </div>
        </div>
      )}
      <h3 className="text-sm font-medium mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </>
  )

  if (bare) {
    return <div className={cn('text-center py-12 px-6', className)}>{content}</div>
  }

  return (
    <Card className={cn('text-center py-12 px-6', className)}>
      {content}
    </Card>
  )
}

export default EmptyState
