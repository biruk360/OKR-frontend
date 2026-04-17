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

const CHART_PRIMARY = '#0052cc'
const AXIS = '#6b778c'

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
      <section className="rounded-lg border border-border bg-card">
        <header className="px-3 py-2 border-b border-border">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Momentum</h3>
        </header>
        <div className="p-3 space-y-2">
          <div className="skeleton h-6 w-20" />
          <div className="skeleton h-48 w-full" />
        </div>
      </section>
    )
  }

  const latestProgress = progressData[progressData.length - 1]?.progress || 0
  const previousProgress = progressData[progressData.length - 2]?.progress || 0
  const progressChange = latestProgress - previousProgress

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Momentum</h3>
        <div className="flex items-center gap-1">
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-600" strokeWidth={2} />}
          {trend === 'down' && <TrendingDown className="h-3 w-3 text-destructive" strokeWidth={2} />}
          {trend === 'stable' && <Minus className="h-3 w-3 text-muted-foreground" strokeWidth={2} />}
          <span
            className={`text-[11px] font-medium ${
              trend === 'up'
                ? 'text-emerald-600'
                : trend === 'down'
                ? 'text-destructive'
                : 'text-muted-foreground'
            }`}
          >
            {progressChange > 0 ? '+' : ''}
            {progressChange.toFixed(1)}%
          </span>
        </div>
      </header>

      <div className="px-3 pt-3">
        <div className="text-[24px] font-semibold text-foreground leading-none">
          {latestProgress.toFixed(1)}%
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Average progress across all objectives
        </div>
      </div>

      <div className="h-[180px] px-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={progressData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <XAxis
              dataKey="date"
              stroke={AXIS}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              }
            />
            <YAxis
              stroke={AXIS}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #dfe1e6',
                borderRadius: '6px',
                boxShadow: '0 4px 8px -2px rgba(9,30,66,0.25)',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#172b4d', fontWeight: 600 }}
              itemStyle={{ color: '#172b4d' }}
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
              dot={{ fill: CHART_PRIMARY, strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, stroke: CHART_PRIMARY, strokeWidth: 2, fill: '#fff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
        <div className="px-3 py-2">
          <div className="text-[18px] font-semibold text-foreground leading-none">
            {progressData[progressData.length - 1]?.objectives || 0}
          </div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">
            Active objectives
          </div>
        </div>
        <div className="px-3 py-2">
          <div className="text-[18px] font-semibold text-foreground leading-none">
            {progressData[progressData.length - 1]?.keyResults || 0}
          </div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-1">
            Key results
          </div>
        </div>
      </div>
    </section>
  )
}
