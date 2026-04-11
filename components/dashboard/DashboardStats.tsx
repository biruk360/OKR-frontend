'use client'

import { Target, CheckCircle, Clock, TrendingUp, FileText, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DashboardStatsProps {
  stats: {
    totalObjectives: number
    activeObjectives: number
    completedObjectives: number
    totalKeyResults: number
    completedKeyResults: number
    totalTodos: number
    completedTodos: number
    averageProgress: number
  }
}

const statCards = [
  {
    name: 'Total Objectives',
    key: 'totalObjectives',
    icon: Target,
    color: 'text-primary-600 bg-primary-500/12',
  },
  {
    name: 'Active Objectives',
    key: 'activeObjectives',
    icon: Clock,
    color: 'text-warning-700 bg-warning-500/12',
  },
  {
    name: 'Completed Objectives',
    key: 'completedObjectives',
    icon: CheckCircle,
    color: 'text-success-700 bg-success-500/12',
  },
  {
    name: 'Total Key Results',
    key: 'totalKeyResults',
    icon: BarChart3,
    color: 'text-primary-600 bg-primary-500/12',
  },
  {
    name: 'Completed Key Results',
    key: 'completedKeyResults',
    icon: CheckCircle,
    color: 'text-success-700 bg-success-500/12',
  },
  {
    name: 'Total Todos',
    key: 'totalTodos',
    icon: FileText,
    color: 'text-ink-secondary bg-surface-app',
  },
  {
    name: 'Completed Todos',
    key: 'completedTodos',
    icon: CheckCircle,
    color: 'text-success-700 bg-success-500/12',
  },
  {
    name: 'Average Progress',
    key: 'averageProgress',
    icon: TrendingUp,
    color: 'text-primary-600 bg-primary-500/12',
    suffix: '%',
  },
]

export default function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
      {statCards.map((card) => {
        const Icon = card.icon
        const value = stats[card.key as keyof typeof stats]
        const displayValue = card.suffix ? `${value}${card.suffix}` : value

        return (
          <div
            key={card.name}
            className="card p-6 transition-shadow duration-[180ms] ease-apple hover:shadow-card-hover"
          >
            <div className="flex items-start gap-4">
              <div className={cn('flex-shrink-0 rounded-card p-3', card.color)}>
                <Icon className="h-6 w-6 stroke-[1.75]" />
              </div>
              <div className="min-w-0 flex-1">
                <dl>
                  <dt className="truncate text-body-sm font-medium text-ink-secondary">{card.name}</dt>
                  <dd className="mt-1 text-display text-ink-primary">
                    {displayValue}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
