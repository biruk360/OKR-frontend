'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface StatGridProps {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5
  className?: string
}

const columnClasses: Record<NonNullable<StatGridProps['columns']>, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
}

export function StatGrid({ children, columns = 4, className }: StatGridProps) {
  return (
    <div className={cn('grid gap-5', columnClasses[columns], className)}>
      {children}
    </div>
  )
}

export default StatGrid
