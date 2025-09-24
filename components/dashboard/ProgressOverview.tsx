'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface ProgressOverviewProps {
  userId: string
}

interface ProgressData {
  date: string
  progress: number
  objectives: number
  keyResults: number
}

export default function ProgressOverview({ userId }: ProgressOverviewProps) {
  const [progressData, setProgressData] = useState<ProgressData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable')

  useEffect(() => {
    // Mock data for now - in real implementation, fetch from API
    const mockData: ProgressData[] = [
      { date: '2024-01-01', progress: 25, objectives: 3, keyResults: 8 },
      { date: '2024-01-08', progress: 32, objectives: 3, keyResults: 9 },
      { date: '2024-01-15', progress: 28, objectives: 4, keyResults: 10 },
      { date: '2024-01-22', progress: 45, objectives: 4, keyResults: 11 },
      { date: '2024-01-29', progress: 52, objectives: 5, keyResults: 12 },
      { date: '2024-02-05', progress: 48, objectives: 5, keyResults: 13 },
      { date: '2024-02-12', progress: 61, objectives: 6, keyResults: 14 },
    ]

    setTimeout(() => {
      setProgressData(mockData)
      setIsLoading(false)
      
      // Calculate trend
      if (mockData.length >= 2) {
        const latest = mockData[mockData.length - 1].progress
        const previous = mockData[mockData.length - 2].progress
        const diff = latest - previous
        
        if (diff > 5) setTrend('up')
        else if (diff < -5) setTrend('down')
        else setTrend('stable')
      }
    }, 1000)
  }, [userId])

  if (isLoading) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Progress Overview</h3>
        <div className="animate-pulse">
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  const latestProgress = progressData[progressData.length - 1]?.progress || 0
  const previousProgress = progressData[progressData.length - 2]?.progress || 0
  const progressChange = latestProgress - previousProgress

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Progress Overview</h3>
        <div className="flex items-center space-x-2">
          {trend === 'up' && <TrendingUp className="h-4 w-4 text-success-600" />}
          {trend === 'down' && <TrendingDown className="h-4 w-4 text-danger-600" />}
          {trend === 'stable' && <Minus className="h-4 w-4 text-gray-600" />}
          <span className={`text-sm font-medium ${
            trend === 'up' ? 'text-success-600' : 
            trend === 'down' ? 'text-danger-600' : 
            'text-gray-600'
          }`}>
            {progressChange > 0 ? '+' : ''}{progressChange.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-3xl font-bold text-gray-900">{latestProgress.toFixed(1)}%</div>
        <div className="text-sm text-gray-500">Average progress across all objectives</div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={progressData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis 
              stroke="#6b7280"
              fontSize={12}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { 
                month: 'long', 
                day: 'numeric',
                year: 'numeric'
              })}
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                name === 'progress' ? 'Progress' : name
              ]}
            />
            <Line
              type="monotone"
              dataKey="progress"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-center">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            {progressData[progressData.length - 1]?.objectives || 0}
          </div>
          <div className="text-sm text-gray-500">Active Objectives</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-900">
            {progressData[progressData.length - 1]?.keyResults || 0}
          </div>
          <div className="text-sm text-gray-500">Key Results</div>
        </div>
      </div>
    </div>
  )
}
