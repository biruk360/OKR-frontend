'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Info } from 'lucide-react'

// Apple Pro chart tokens (see components/dashboard/AppleAnalytics.tsx)
const CHART_PRIMARY = 'var(--ap-accent)'
const AXIS = 'var(--ap-fg-subtle)'
const GRID = 'var(--ap-border-soft)'

export type PerformanceTrendChartPoint = {
  cycleName: string
  periodEnd: string
  normalized: number | null
}

/**
 * Multi-cycle normalized-score trend (0-100). Points are sorted by periodEnd.
 * With a single finalized point it shows a "more data needed" note instead.
 */
export function PerformanceTrend({ points, height = 220 }: { points: PerformanceTrendChartPoint[]; height?: number }) {
  const data = points
    .filter((point) => point.normalized != null)
    .sort((a, b) => new Date(a.periodEnd).getTime() - new Date(b.periodEnd).getTime())
    .map((point) => ({ cycleName: point.cycleName, normalized: Math.round(((point.normalized as number) + Number.EPSILON) * 10) / 10 }))

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No finalized scores yet — the trend appears after your first finalized review.</p>
  }
  if (data.length === 1) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <Info className="size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{data[0].cycleName}: {data[0].normalized.toFixed(1)} / 100</p>
          <p className="text-xs text-muted-foreground">More data needed — the trend line appears after the next finalized review cycle.</p>
        </div>
      </div>
    )
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="cycleName" stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} domain={[0, 100]} />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--ap-bg-raised)',
              border: '1px solid var(--ap-border)',
              borderRadius: '10px',
              boxShadow: '0 4px 8px -2px rgba(0,0,0,0.18)',
              fontSize: '12px',
            }}
            labelStyle={{ color: 'var(--ap-fg)', fontWeight: 600 }}
            itemStyle={{ color: 'var(--ap-fg-muted)' }}
            formatter={(value: number) => [`${value.toFixed(1)} / 100`, 'Normalized score']}
          />
          <Line
            type="monotone"
            dataKey="normalized"
            stroke={CHART_PRIMARY}
            strokeWidth={2}
            dot={{ fill: CHART_PRIMARY, strokeWidth: 0, r: 3 }}
            activeDot={{ r: 5, stroke: CHART_PRIMARY, strokeWidth: 2, fill: 'var(--ap-bg-raised)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
