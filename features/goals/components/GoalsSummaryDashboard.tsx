'use client'

import { useMemo } from 'react'

interface GoalsSummaryDashboardProps {
  stats: {
    total: number
    onTrack: number
    atRisk: number
    offTrack: number
    closed: number
    noStatus: number
    avgProgress: number
  }
}

export default function GoalsSummaryDashboard({ stats }: GoalsSummaryDashboardProps) {
  const circumference = 2 * Math.PI * 45 // radius = 45
  const offset = circumference - (stats.avgProgress / 100) * circumference

  return (
    <div className="bg-card p-6 rounded-lg border border-border">
      <div className="grid grid-cols-1 lg:grid-cols-6 gap-6">
        {/* Overall Progress Donut Chart */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center">
          <div className="relative w-32 h-32">
            <svg className="transform -rotate-90 w-32 h-32">
              <circle
                cx="64"
                cy="64"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-gray-200"
              />
              <circle
                cx="64"
                cy="64"
                r="45"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="text-blue-600 transition-all duration-500"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{stats.avgProgress}%</div>
                <div className="text-xs text-muted-foreground">Overall Progress</div>
              </div>
            </div>
          </div>
        </div>

        {/* Status Summary Cards */}
        <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-muted rounded-lg p-4 border border-border">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-gray-400"></div>
              <span className="text-xs font-medium text-muted-foreground">No Status</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.noStatus}</div>
          </div>

          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs font-medium text-green-700">On Track</span>
            </div>
            <div className="text-2xl font-bold text-green-900">{stats.onTrack}</div>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <span className="text-xs font-medium text-yellow-700">At Risk</span>
            </div>
            <div className="text-2xl font-bold text-yellow-900">{stats.atRisk}</div>
          </div>

          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span className="text-xs font-medium text-red-700">Off Track</span>
            </div>
            <div className="text-2xl font-bold text-red-900">{stats.offTrack}</div>
          </div>

          <div className="bg-muted rounded-lg p-4 border border-border">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-muted0"></div>
              <span className="text-xs font-medium text-muted-foreground">Closed</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{stats.closed}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

