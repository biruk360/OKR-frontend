'use client'

import { 
  Target, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  Users,
  FileText,
  BarChart3
} from 'lucide-react'
import { cn, getProgressColor } from '@/lib/utils'

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
    color: 'text-primary-600 bg-primary-100',
  },
  {
    name: 'Active Objectives',
    key: 'activeObjectives',
    icon: Clock,
    color: 'text-warning-600 bg-warning-100',
  },
  {
    name: 'Completed Objectives',
    key: 'completedObjectives',
    icon: CheckCircle,
    color: 'text-success-600 bg-success-100',
  },
  {
    name: 'Total Key Results',
    key: 'totalKeyResults',
    icon: BarChart3,
    color: 'text-primary-600 bg-primary-100',
  },
  {
    name: 'Completed Key Results',
    key: 'completedKeyResults',
    icon: CheckCircle,
    color: 'text-success-600 bg-success-100',
  },
  {
    name: 'Total Todos',
    key: 'totalTodos',
    icon: FileText,
    color: 'text-gray-600 bg-gray-100',
  },
  {
    name: 'Completed Todos',
    key: 'completedTodos',
    icon: CheckCircle,
    color: 'text-success-600 bg-success-100',
  },
  {
    name: 'Average Progress',
    key: 'averageProgress',
    icon: TrendingUp,
    color: 'text-primary-600 bg-primary-100',
    suffix: '%',
  },
]

export default function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((card) => {
        const Icon = card.icon
        const value = stats[card.key as keyof typeof stats]
        const displayValue = card.suffix ? `${value}${card.suffix}` : value

        return (
          <div key={card.name} className="card p-5">
            <div className="flex items-center">
              <div className={cn('flex-shrink-0 rounded-md p-3', card.color)}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {card.name}
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
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
