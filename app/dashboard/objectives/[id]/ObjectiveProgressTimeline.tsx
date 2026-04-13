'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceDot,
} from 'recharts'

interface Snapshot {
  periodStart: string // YYYY-MM-DD
  score: number
}

interface TimelineProps {
  /** Bi-weekly confidence snapshots for the objective (chronological). */
  snapshots: Snapshot[]
  /** Live / current progress percentage (for a "today" marker). */
  currentProgress: number
  /** Timeframe window used to draw the expected trajectory. */
  timeframeStart: string | Date
  timeframeEnd: string | Date
}

/**
 * "Expected vs Actual" progress chart for an objective detail page.
 *
 * - **Expected** line: linear 0 → 100 from timeframe start to end.
 * - **Actual** line: the bi-weekly ConfidenceSnapshot scores (0-100).
 * - Current-progress dot is overlaid on today's column.
 */
export default function ObjectiveProgressTimeline({
  snapshots,
  currentProgress,
  timeframeStart,
  timeframeEnd,
}: TimelineProps) {
  const data = useMemo(() => {
    const start = new Date(timeframeStart).getTime()
    const end = new Date(timeframeEnd).getTime()
    const span = Math.max(end - start, 1)

    // Build a sparse row list from snapshots + the two anchor points.
    const points: Array<{ date: string; t: number; actual: number | null; expected: number }> = []

    // Anchor: start of timeframe (expected = 0, actual unknown)
    points.push({
      date: format(new Date(timeframeStart), 'MMM d'),
      t: start,
      actual: null,
      expected: 0,
    })

    for (const s of snapshots) {
      const t = parseISO(s.periodStart).getTime()
      points.push({
        date: format(parseISO(s.periodStart), 'MMM d'),
        t,
        actual: Math.round(s.score),
        expected: Math.round(((t - start) / span) * 100),
      })
    }

    // Anchor: end of timeframe (expected = 100)
    points.push({
      date: format(new Date(timeframeEnd), 'MMM d'),
      t: end,
      actual: null,
      expected: 100,
    })

    // De-dup by timestamp just in case snapshots overlap the start/end anchors.
    const seen = new Set<number>()
    return points
      .filter((p) => {
        if (seen.has(p.t)) return false
        seen.add(p.t)
        return true
      })
      .sort((a, b) => a.t - b.t)
  }, [snapshots, timeframeStart, timeframeEnd])

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#6B7280' }}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6B7280' }}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={false}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value: any) => `${value}%`}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="plainline"
          />
          <Line
            type="monotone"
            dataKey="expected"
            name="Expected"
            stroke="#9CA3AF"
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={false}
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#2563EB"
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
            activeDot={{ r: 5 }}
            connectNulls
          />
          {/* Overlay today's live progress as a single accent dot on the final anchor */}
          <ReferenceDot
            x={data[data.length - 1]?.date}
            y={Math.max(0, Math.min(100, currentProgress))}
            r={5}
            fill="#2563EB"
            stroke="white"
            strokeWidth={2}
            label={{
              value: `${Math.round(currentProgress)}% (Current)`,
              position: 'top',
              fontSize: 11,
              fill: '#2563EB',
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
