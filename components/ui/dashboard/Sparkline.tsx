'use client'

import { Area, AreaChart, ResponsiveContainer } from 'recharts'

interface Props {
  /** Numeric series — typically 6-12 points. Empty/single-point series renders nothing. */
  data: number[]
  /** Stroke + fill tint (any CSS color). */
  color?: string
  /** Container height in px. Default 28. */
  height?: number
}

/**
 * Tiny inline trend chart for KPI tiles. No axes, no tooltip — purely visual.
 * Pair with the numeric value above it; the spark only shows direction.
 */
export function Sparkline({ data, color = '#007AFF', height = 28 }: Props) {
  if (!data || data.length < 2) return null
  const series = data.map((value, index) => ({ index, value }))
  const gradientId = `spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
