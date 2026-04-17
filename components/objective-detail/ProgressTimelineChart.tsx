'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

interface Snapshot {
  periodStart: string
  score: number
}

interface Props {
  snapshots: Snapshot[]
  expectedProgress: number
  timeframe: { startDate: Date | string; endDate: Date | string }
}

export default function ProgressTimelineChart({ snapshots, expectedProgress, timeframe }: Props) {
  const start = new Date(timeframe.startDate).getTime()
  const end = new Date(timeframe.endDate).getTime()
  const now = Date.now()

  // Build chart data: one point per snapshot + a "today" marker
  const data = snapshots.map(s => ({
    date: new Date(s.periodStart).getTime(),
    label: new Date(s.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    actual: Math.round(s.score),
  }))

  // Expected pace line: start=0, end=100, interpolate linearly
  const expectedData = [
    { date: start, expected: 0 },
    { date: end, expected: 100 },
  ]

  // Merge expected into actual data points for tooltip
  const merged = data.map(d => {
    const elapsed = end > start ? (d.date - start) / (end - start) : 0
    return { ...d, expected: Math.round(elapsed * 100) }
  })

  if (merged.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card">
        <header className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Progress Timeline</h3>
        </header>
        <div className="p-8 text-center text-sm text-muted-foreground">
          No confidence snapshots yet. Check in to start building your timeline.
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Progress Timeline</h3>
      </header>
      <div className="h-[200px] px-2 py-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => [
                `${value}%`,
                name === 'actual' ? 'Actual' : 'Expected',
              ]}
            />
            {/* Expected pace (dashed) */}
            <Line
              type="monotone"
              dataKey="expected"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
            />
            {/* Actual progress (solid) */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, stroke: 'hsl(var(--primary))', strokeWidth: 2, fill: 'hsl(var(--card))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
