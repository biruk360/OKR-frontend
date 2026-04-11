'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
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

const CHART_PRIMARY = '#007AFF'
const AXIS = '#8E8E93'

export default function ProgressOverview({ userId }: ProgressOverviewProps) {
  const [progressData, setProgressData] = useState<ProgressData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable')

  useEffect(() => {
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
        <h3 className="mb-4 text-section-title text-ink-primary">Progress Overview</h3>
        <div className="space-y-3">
          <div className="skeleton h-8 w-24" />
          <div className="skeleton h-64 w-full rounded-card-lg" />
        </div>
      </div>
    )
  }

  const latestProgress = progressData[progressData.length - 1]?.progress || 0
  const previousProgress = progressData[progressData.length - 2]?.progress || 0
  const progressChange = latestProgress - previousProgress

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-section-title text-ink-primary">Progress Overview</h3>
        <div className="flex items-center gap-2">
          {trend === 'up' && <TrendingUp className="h-4 w-4 text-success-600" strokeWidth={2} />}
          {trend === 'down' && <TrendingDown className="h-4 w-4 text-danger-500" strokeWidth={2} />}
          {trend === 'stable' && <Minus className="h-4 w-4 text-ink-secondary" strokeWidth={2} />}
          <span
            className={`text-body-sm font-medium ${
              trend === 'up' ? 'text-success-700' : trend === 'down' ? 'text-danger-600' : 'text-ink-secondary'
            }`}
          >
            {progressChange > 0 ? '+' : ''}
            {progressChange.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-display text-ink-primary">{latestProgress.toFixed(1)}%</div>
        <div className="text-body-sm text-ink-secondary">Average progress across all objectives</div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={progressData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="date"
              stroke={AXIS}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
            />
            <YAxis
              stroke={AXIS}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
              }}
              labelStyle={{ color: '#1D1D1F', fontWeight: 600 }}
              itemStyle={{ color: '#1D1D1F' }}
              labelFormatter={(value) =>
                new Date(value).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              }
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                name === 'progress' ? 'Progress' : name,
              ]}
            />
            <Line
              type="monotone"
              dataKey="progress"
              stroke={CHART_PRIMARY}
              strokeWidth={2}
              dot={{ fill: CHART_PRIMARY, strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, stroke: CHART_PRIMARY, strokeWidth: 2, fill: '#fff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-ink-secondary/10 pt-6 text-center">
        <div>
          <div className="text-section-title text-ink-primary">
            {progressData[progressData.length - 1]?.objectives || 0}
          </div>
          <div className="text-body-sm text-ink-secondary">Active Objectives</div>
        </div>
        <div>
          <div className="text-section-title text-ink-primary">
            {progressData[progressData.length - 1]?.keyResults || 0}
          </div>
          <div className="text-body-sm text-ink-secondary">Key Results</div>
        </div>
      </div>
    </div>
  )
}
