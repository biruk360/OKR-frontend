'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import {
  buildChartRows,
  formatAxisValue,
  type CheckInForChart,
  type TimeframeLike,
} from '@/lib/keyResultChart'

type KrLike = {
  startValue?: number
  targetValue?: number
  currentValue?: number
  createdAt?: string | Date
  unit?: string
}

interface KeyResultProgressChartProps {
  keyResult: KrLike
  checkIns: CheckInForChart[]
  timeframe: TimeframeLike
  height?: number
  showTodayMarker?: boolean
}

export default function KeyResultProgressChart({
  keyResult,
  checkIns,
  timeframe,
  height = 300,
  showTodayMarker = true,
}: KeyResultProgressChartProps) {
  const { combined, t0, t1 } = useMemo(
    () => buildChartRows(keyResult, checkIns, timeframe),
    [keyResult, checkIns, timeframe]
  )

  const chartData = useMemo(
    () => combined.map((row) => ({ ...row, label: format(row.t, 'd MMM') })),
    [combined]
  )

  const unit = keyResult.unit || ''
  const now = Date.now()

  return (
    <div style={{ height }} className="w-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[t0, t1]}
            tickFormatter={(ts) => format(ts as number, 'd MMM')}
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatAxisValue}
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
            width={52}
          />
          <Tooltip
            labelFormatter={(ts) => format(ts as number, 'PP')}
            formatter={(v: number) => [`${formatAxisValue(v)} ${unit}`.trim(), '']}
          />
          <Legend />
          {showTodayMarker && now >= t0 && now <= t1 ? (
            <ReferenceLine
              x={now}
              stroke="#6366f1"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: 'Today', position: 'top', fill: '#6366f1', fontSize: 11 }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="expected"
            name="Expected pace"
            stroke="#d1d5db"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3, fill: '#fbbf24', stroke: '#2563eb', strokeWidth: 1 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
